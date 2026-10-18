import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import vm from 'node:vm';
import ts from 'typescript';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyClipDuration } from './verify_clip.js';

const run = promisify(execFile);
test('real local HLS segments through production capture and duration verification', {
  skip: !process.env.TEST_HLS_SOURCE || !process.env.TEST_HLS_OUTPUT, timeout: 180000,
}, async (t) => {
  const directory = path.resolve(process.env.TEST_HLS_OUTPUT!);
  fs.mkdirSync(directory, { recursive: true });
  const playlistPath = path.join(directory, 'source.m3u8');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', process.env.TEST_HLS_SOURCE!,
    '-c', 'copy', '-hls_time', '5', '-hls_playlist_type', 'vod', '-hls_segment_filename',
    path.join(directory, 'segment-%03d.ts'), playlistPath], { timeout: 60000, windowsHide: true });

  const source = fs.readFileSync(new URL('./clip_mp4_worker.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('worker.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['fetchHlsPlaylist', 'prepareRumbleClipPlaylist', 'renderAndUploadClip', 'safeName', 'nowMs'];
  const functions = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text ?? ''));
  assert.equal(functions.length, names.length);
  const code = ts.transpileModule(functions.map(s => s.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Serve the fixture over loopback: Windows FFmpeg does not consistently
  // accept file:///C:/ segment URLs, while production consumes HTTP segments.
  const server = createServer((req, res) => {
    const filename = path.join(directory, path.basename(new URL(req.url || '/', 'http://localhost').pathname));
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const playlistUrl = `http://127.0.0.1:${address.port}/source.m3u8`;
  const artifact = path.join(directory, 'captured.mp4');
  let success = 0, uploads = 0;
  const context = vm.createContext({ fs, path, os: { tmpdir: () => directory }, console, Error,
    URL, AbortController, setTimeout, clearTimeout, CRF: 22, AAC_K: 128,
    fetch: async (url: string) => {
      assert.equal(url, playlistUrl, 'only the local fixture may be read');
      return fetch(url);
    },
    delay: async () => { throw new Error('complete fixture must not wait'); },
    runFfmpeg: async (args: string[], timeout: number) => {
      try {
        await run('ffmpeg', args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 });
        return { ok: true };
      } catch (e) { return { ok: false, err: String(e) }; }
    },
    verifyClipDuration,
    putFileToR2: async (p: { filePath: string }) => { uploads++; fs.copyFileSync(p.filePath, artifact); },
    setClipMp4Success: async () => { success++; },
  });
  vm.runInContext(code, context);
  await context.renderAndUploadClip({ id: 176, platform: 'rumble', vod_url: playlistUrl,
    at_sec: 83, pre_sec: 50, post_sec: 15, live_start_ts: 1, created_ts: Date.now() - 3600000 });
  assert.equal(uploads, 1); assert.equal(success, 1);
  const duration = await verifyClipDuration(artifact, 65);
  assert.ok(Math.abs(duration - 65) <= 0.25, 'capture must preserve the requested duration');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', artifact, '-f', 'null', '-'],
    { timeout: 60000, windowsHide: true });
  // Compare CONTENT, not just track timestamps. Previously both timestamps
  // could be zero while speech belonged to several seconds before the image.
  const audio = async (file: string, start: number, duration: number) => {
    const { stdout } = await run('ffmpeg', ['-v','error','-threads','1','-ss',String(start),'-i',file,
      '-t',String(duration),'-vn','-ac','1','-ar','2000','-f','f32le','-'],
      { timeout: 60000, encoding: 'buffer', maxBuffer: 1024 * 1024, windowsHide: true });
    return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
  };
  const frame = async (file: string, start: number) => (await run('ffmpeg', [
    '-v','error','-threads','1','-ss',String(start),'-i',file,'-frames:v','1',
    '-vf','scale=96:54,format=gray','-f','rawvideo','-'],
    { timeout:60000,encoding:'buffer',maxBuffer:1024*1024,windowsHide:true })).stdout;
  const checks=[];
  for (const at of [5,25,50]) {
    const reference=await audio(process.env.TEST_HLS_SOURCE!,33+at-.2,3.4);
    const captured=await audio(artifact,at,3);let best=-1,bestAt=0;
    for(let offset=0;offset+captured.length<=reference.length;offset++) {
      let dot=0,a=0,b=0;for(let i=0;i<captured.length;i++){dot+=reference[offset+i]*captured[i];a+=reference[offset+i]**2;b+=captured[i]**2;}
      const score=dot/Math.sqrt(Math.max(1e-20,a*b));if(score>best){best=score;bestAt=offset;}
    }
    const lag=bestAt/2000-.2;assert.ok(best>.85&&Math.abs(lag)<.08,`audio does not match common-clock reference at ${at}s: ${best}, ${lag}`);
    const a=await frame(process.env.TEST_HLS_SOURCE!,33+at),b=await frame(artifact,at);assert.equal(a.length,b.length);
    const mse=a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length;
    assert.ok(mse<500,`video differs from reference at ${at}s: MSE ${mse}`);
    checks.push({at,audioCorrelation:best,audioLag:lag,videoMse:mse});
  }
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({
    source: process.env.TEST_HLS_SOURCE, artifact, requestedStart: 33, requestedEnd: 98,
    expectedDuration: 65, actualDuration: duration, decoded: true,
    contentChecks:checks,
    scope: 'Real loopback HTTP HLS/FFmpeg; R2 and database replaced by local fixtures',
  }, null, 2));
});
