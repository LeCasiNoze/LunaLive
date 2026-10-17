"""Offline tests only: synthetic media, temporary files, no network publication."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import fcntl

HERE = Path(__file__).parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


admin, fanout = module('multistream_admin'), module('multistream_fanout')


class Destinations(unittest.TestCase):
    def test_only_official_ingest_hosts_and_no_embedded_credentials(self):
        key = 'fixture-only-stream-key'
        self.assertFalse(admin.validate_target('twitch', 'rtmp://live.twitch.tv/app', key)['enabled'])
        self.assertFalse(admin.validate_target('kick', 'rtmps://test.global-contribute.live-video.net:443/app', key)['enabled'])
        for url in ['https://live.twitch.tv/app', 'rtmp://evil.example/app',
                    'rtmp://live.twitch.tv.evil.example/app', 'rtmp://user@live.twitch.tv/app',
                    'rtmp://live.twitch.tv/app?other=1', 'rtmp://live.twitch.tv:999/app']:
            with self.assertRaises(ValueError):
                admin.validate_target('twitch', url, key)
        with self.assertRaises(ValueError):
            admin.validate_target('twitch', 'rtmp://live.twitch.tv/app', key + '\n')

    def test_invalid_configuration_does_not_write(self):
        with tempfile.TemporaryDirectory() as folder:
            previous = admin.PATH
            admin.PATH = Path(folder) / 'config.json'
            try:
                with self.assertRaises(ValueError):
                    admin.execute('configure', {'platform': 'twitch', 'url': 'http://evil.example', 'key': 'fixture'})
                self.assertFalse(admin.PATH.exists())
            finally:
                admin.PATH = previous

    def test_manual_switch_preserves_revision_and_file_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            owner = root/'owner.json'
            owner.write_text(json.dumps({'owner':'automod','revision':8}))
            original = owner.stat()
            admin.select_manual(root)
            self.assertEqual(json.loads(owner.read_text())['owner'], 'manual')
            self.assertEqual(json.loads(owner.read_text())['revision'], 9)
            self.assertEqual(owner.stat().st_uid, original.st_uid)
            admin.select_manual(root)
            self.assertEqual(json.loads(owner.read_text())['revision'], 9)

    def test_active_publisher_prevents_manual_switch_without_changing_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            owner = root/'owner.json'
            owner.write_text(json.dumps({'owner':'automod','revision':8}))
            with (root/'output.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError):
                    admin.select_manual(root)
            self.assertEqual(json.loads(owner.read_text()), {'owner':'automod','revision':8})


class Fanout(unittest.TestCase):
    def test_failed_or_slow_destination_never_blocks_other_sink(self):
        bad = fanout.Sink('bad', 'fixture', [sys.executable, '-c', 'import time; time.sleep(30)'])
        with tempfile.TemporaryDirectory() as folder:
            target = str(Path(folder) / 'copy.bin')
            good = fanout.Sink('good', 'fixture', [sys.executable, '-c', 'import pathlib,sys; pathlib.Path(sys.argv[1]).write_bytes(sys.stdin.buffer.read())', target])
            try:
                start = time.monotonic()
                packet = b'fixture' * 5000
                for _ in range(100):
                    bad.put(packet)
                    good.put(packet)
                    time.sleep(.002)
                self.assertLess(time.monotonic() - start, 2)
                self.assertGreater(good.bytes_written, 0)
                self.assertLessEqual(bad.packets.qsize(), 32)
            finally:
                bad.stop()
                good.stop()

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg tools needed')
    def test_three_destinations_keep_video_audio_and_duration_without_encoding(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            fixture = folder / 'fixture.ts'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25',
                            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4',
                            '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-c:a', 'aac',
                            '-f', 'mpegts', str(fixture)], check=True, capture_output=True)
            sinks = []
            try:
                for index in range(3):
                    command = ['ffmpeg', '-v', 'error', '-f', 'mpegts', '-i', 'pipe:0', '-map', '0:v:0',
                               '-map', '0:a:0', '-c', 'copy', '-f', 'flv', str(folder / (str(index)+'.flv'))]
                    sinks.append(fanout.Sink(str(index), 'fixture', command))
                payload = fixture.read_bytes()
                for offset in range(0, len(payload), 188*188):
                    for sink in sinks:
                        self.assertTrue(sink.put(payload[offset:offset+188*188]))
                    time.sleep(.005)
                deadline = time.monotonic()+10
                while time.monotonic()<deadline and any(s.bytes_written != len(payload) for s in sinks):
                    time.sleep(.02)
                for sink in sinks:
                    self.assertEqual(sink.bytes_written, len(payload))
                    sink.stopped.set()
                    sink.child.stdin.close()
                    self.assertEqual(sink.child.wait(timeout=10), 0)
                for index in range(3):
                    data = json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams',
                                                              '-show_format','-of','json',str(folder/(str(index)+'.flv'))]))
                    self.assertEqual({s['codec_name'] for s in data['streams']}, {'h264','aac'})
                    video = next(s for s in data['streams'] if s['codec_type']=='video')
                    self.assertEqual(int(video['nb_read_frames']), 100)
                    self.assertAlmostEqual(float(data['format']['duration']), 4, delta=.15)
            finally:
                for sink in sinks:
                    sink.stop()


if __name__ == '__main__':
    unittest.main(verbosity=2)
