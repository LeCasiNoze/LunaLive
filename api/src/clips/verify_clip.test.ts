import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyClipDuration } from './verify_clip.js';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

test('invalid expectations are rejected before spawning a probe', async () => {
  for (const value of [0, -1, NaN, Infinity]) {
    await assert.rejects(verifyClipDuration('unused.mp4', value), /invalid_expected_duration/);
  }
});

test('actual rendered video passes; physically shortened video fails', {
  skip: !process.env.TEST_COMPLETE_CLIP || !process.env.TEST_SHORT_CLIP,
}, async () => {
  const duration = await verifyClipDuration(process.env.TEST_COMPLETE_CLIP!, 64.8);
  assert.ok(Math.abs(duration - 64.8) < 0.1);
  await assert.rejects(verifyClipDuration(process.env.TEST_SHORT_CLIP!, 64.8), /clip_video_too_short/);
  await assert.rejects(verifyClipDuration(process.env.TEST_COMPLETE_CLIP!, 60), /clip_video_too_long/);
});

test('a missing file cannot pass verification', async () => {
  await assert.rejects(verifyClipDuration('nonexistent-lunaclip-verification-file.mp4', 10));
});

test('FFmpeg success with short output never uploads or marks clip ready', async () => {
  const source = fs.readFileSync(new URL('./clip_mp4_worker.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('worker.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'renderAndUploadClip');
  assert.ok(fn);
  let uploads = 0, completed = 0, removed = 0, probes = 0;
  const context = vm.createContext({
    path, os: { tmpdir: () => '/test' }, nowMs: () => 1, safeName: () => 'test', Error, CRF: 22, AAC_K: 128,
    fs: { unlinkSync() { removed++; }, existsSync: () => true, statSync: () => ({ size: 100 }) },
    runFfmpeg: async (args: string[]) => {
      assert.ok(!args.includes('-extension_picky'), 'MP4 must not receive HLS options');
      assert.ok(!args.includes('-allowed_segment_extensions'));
      return { ok: true };
    },
    verifyClipDuration: async (_: string, duration: number) => {
      probes++; assert.equal(duration, 120); throw new Error('clip_video_too_short');
    },
    putFileToR2: async () => { uploads++; }, setClipMp4Success: async () => { completed++; },
  });
  vm.runInContext(ts.transpileModule(fn.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  await assert.rejects(context.renderAndUploadClip({ id: 1, vod_url: 'https://example.test/video.mp4',
    at_sec: 300, pre_sec: 105, post_sec: 15, platform: 'dlive' }), /clip_video_too_short/);
  assert.equal(probes, 1); assert.equal(uploads, 0); assert.equal(completed, 0);
  assert.equal(removed, 2); // Initial output cleanup and finally cleanup.
});
