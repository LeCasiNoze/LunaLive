"""Copy one local OBS feed to independent destinations without video encoding."""
from pathlib import Path
import json
import os
import queue
import signal
import subprocess
import threading
import time
import sys

CONFIG = Path('/etc/lunalive-multistream/destinations.json')
STATUS = Path('/opt/automod/.runtime/publication/multistream-status.json')
OBS_INGEST = 'rtmp://127.0.0.1:1936/manual/live'


class Sink:
    def __init__(self, name, destination, command=None):
        self.name, self.destination = name, destination
        self.command = command or ['/usr/bin/ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'quiet',
                                   '-f', 'mpegts', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?',
                                   '-c', 'copy', '-rw_timeout', '15000000', '-f', 'flv', destination]
        self.packets = queue.Queue(maxsize=32)
        self.stopped = threading.Event()
        self.child = None
        self.in_flight = False
        self.draining = False
        self.state = 'waiting_for_source'
        self.reconnects = self.bytes_written = self.last_exit = 0
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def put(self, packet):
        try:
            self.packets.put_nowait(packet)
            return True
        except queue.Full:
            # A failed destination must never backpressure OBS or another sink.
            self.state = 'slow_destination_reconnecting'
            if self.child and self.child.poll() is None:
                self.child.kill()
            return False

    def run(self):
        while not self.stopped.is_set():
            try:
                packet = self.packets.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                self.in_flight = True
                if self.child is None or self.child.poll() is not None:
                    if self.child is not None:
                        self.last_exit = self.child.returncode
                        self.child.stdin.close()
                        self.reconnects += 1
                        self.state = 'reconnecting'
                        if self.stopped.wait(3):
                            break
                        # Resume with current content, never replay queued old video.
                        while True:
                            try:
                                packet = self.packets.get_nowait()
                            except queue.Empty:
                                break
                    self.child = subprocess.Popen(self.command, stdin=subprocess.PIPE,
                                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.child.stdin.write(packet)
                self.child.stdin.flush()
                self.bytes_written += len(packet)
                self.state = 'feeding_destination'
            except (BrokenPipeError, OSError):
                self.state = 'destination_unavailable'
                if self.child and self.child.poll() is None:
                    self.child.kill()
            finally:
                self.in_flight = False
        if self.child:
            if self.draining and self.child.stdin and not self.child.stdin.closed:
                self.child.stdin.close()
            elif self.child.poll() is None:
                self.child.terminate()
            try:
                self.child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait()
            if self.child.stdin and not self.child.stdin.closed:
                self.child.stdin.close()
        self.state = 'stopped'

    def finish(self):
        deadline=time.monotonic()+3
        while (not self.packets.empty() or self.in_flight) and time.monotonic()<deadline:
            time.sleep(.01)
        self.draining=True
        self.stopped.set()
        self.thread.join(timeout=4)
        if self.thread.is_alive():
            self.stop()

    def stop(self):
        self.stopped.set()
        if self.child and self.child.poll() is None:
            self.child.kill()  # Interrupt a blocked pipe write immediately.
        self.thread.join(timeout=4)

    def status(self):
        return {'state': self.state, 'reconnects': self.reconnects, 'bytesCopied': self.bytes_written,
                'queuedChunks': self.packets.qsize(), 'lastExitCode': self.last_exit}


def configured_targets():
    try:
        document = json.loads(CONFIG.read_text())
    except FileNotFoundError:
        document = {}
    result = {}
    rumble_url = os.environ.get('RUMBLE_MANUAL_RTMP_URL') or os.environ.get('RUMBLE_RTMP_URL', '')
    rumble_key = os.environ.get('RUMBLE_MANUAL_STREAM_KEY') or os.environ.get('RUMBLE_STREAM_KEY', '')
    if rumble_url and rumble_key and document.get('rumble', {}).get('enabled', True):
        result['rumble'] = rumble_url.rstrip('/') + '/' + rumble_key
    for name in ('kick', 'twitch'):
        item = document.get(name, {})
        if item.get('enabled') and item.get('url') and item.get('key'):
            result[name] = item['url'].rstrip('/') + '/' + item['key']
    return result


def run(input_mode='obs'):
    stopped = threading.Event()
    ready = threading.Event()
    sinks, lock = {}, threading.Lock()
    source = None if input_mode=='stdin' else subprocess.Popen(['/usr/bin/ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'quiet',
                               '-listen', '1', '-i', OBS_INGEST,
                               '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy',
                               '-mpegts_flags', '+resend_headers', '-f', 'mpegts', 'pipe:1'],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    source_stream = sys.stdin.buffer if source is None else source.stdout
    started = time.time()
    last_packet = [None]
    natural_eof=False

    def shutdown(_sig, _frame):
        stopped.set()
        if source and source.poll() is None:
            source.terminate()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, shutdown)

    def supervise():
        while not stopped.is_set():
            try:
                targets = configured_targets()
                with lock:
                    for name in list(sinks):
                        if name not in targets or sinks[name].destination != targets[name]:
                            sinks.pop(name).stop()
                    for name, destination in targets.items():
                        if name not in sinks:
                            sinks[name] = Sink(name, destination)
                    status = {'startedAt': started, 'lastPacketAt': last_packet[0],
                              'source': ('receiving_' if last_packet[0] and time.time()-last_packet[0] < 10 else 'waiting_for_')+('automod' if input_mode=='stdin' else 'obs'),
                              'mode':'automod' if input_mode=='stdin' else 'manual',
                              'encoding': False, 'outputs': {name: sink.status() for name, sink in sinks.items()}}
                ready.set()
                STATUS.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                temporary = STATUS.with_suffix('.tmp')
                temporary.write_text(json.dumps(status))
                temporary.chmod(0o600)
                temporary.replace(STATUS)
            except (OSError, ValueError):
                pass  # Keep an existing healthy output during an invalid config write.
            stopped.wait(1)

    supervisor = threading.Thread(target=supervise, daemon=True)
    supervisor.start()
    ready.wait(3)
    try:
        while not stopped.is_set():
            packet = source_stream.read(188*188)
            if not packet:
                natural_eof=True
                break
            last_packet[0] = time.time()
            with lock:
                for sink in sinks.values():
                    sink.put(packet)
    finally:
        stopped.set()
        if source and source.poll() is None:
            source.terminate()
        try:
            if source: source.wait(timeout=5)
        except subprocess.TimeoutExpired:
            source.kill()
            source.wait()
        supervisor.join(timeout=6)
        with lock:
            for sink in sinks.values():
                sink.finish() if natural_eof else sink.stop()
        STATUS.unlink(missing_ok=True)
    return (source.returncode if source else 0) or 0


if __name__ == '__main__':
    raise SystemExit(run('stdin' if '--stdin' in sys.argv[1:] else 'obs'))
