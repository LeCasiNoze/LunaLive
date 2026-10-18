import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';

Object.assign(process.env, {
  R2_ACCOUNT_ID: 'test-account', R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_BASE_URL: 'https://media.example.test',
});
const { uploadToR2 } = await import('./r2.js');

for (const scenario of ['retry', 'forbidden', 'empty', 'exhausted', 'image']) {
  await test(`R2 ${scenario}`, async (t) => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lunaclip-r2-test-'));
    const file = path.join(folder, 'clip.mp4');
    const payload = scenario === 'empty' ? Buffer.alloc(0) : Buffer.from('test MP4 payload');
    fs.writeFileSync(file, payload);
    const originalSend = S3Client.prototype.send;
    const originalDestroy = S3Client.prototype.destroy;
    const uploads: Buffer[] = [];
    let destroyed = 0;
    S3Client.prototype.send = (async (command: { input: { Body: AsyncIterable<Buffer>; Key: string; ContentType: string } }) => {
      assert.equal(command.input.Key, 'clips/job_42.mp4');
      assert.equal(command.input.ContentType, scenario === 'image' ? 'image/jpeg' : 'video/mp4');
      const chunks: Buffer[] = [];
      for await (const chunk of command.input.Body) chunks.push(Buffer.from(chunk));
      uploads.push(Buffer.concat(chunks));
      if (scenario === 'forbidden') throw Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } });
      if (scenario === 'exhausted' || (scenario === 'retry' && uploads.length === 1)) {
        throw Object.assign(new Error('unavailable'), { $metadata: { httpStatusCode: 503 } });
      }
      return {};
    }) as typeof S3Client.prototype.send;
    S3Client.prototype.destroy = () => { destroyed++; };
    t.after(() => {
      S3Client.prototype.send = originalSend;
      S3Client.prototype.destroy = originalDestroy;
      fs.rmSync(folder, { recursive: true, force: true });
    });
    if (scenario === 'image') {
      assert.equal(await uploadToR2(file, 'clips/job_42.mp4','image/jpeg'),'https://media.example.test/clips/job_42.mp4');
      assert.equal(uploads.length,1);
    } else if (scenario === 'retry') {
      assert.equal(await uploadToR2(file, 'clips/job_42.mp4'), 'https://media.example.test/clips/job_42.mp4');
      assert.equal(uploads.length, 2);
      for (const bytes of uploads) assert.deepEqual(bytes, payload);
    } else {
      await assert.rejects(uploadToR2(file, 'clips/job_42.mp4'));
      assert.equal(uploads.length, scenario === 'empty' ? 0 : scenario === 'forbidden' ? 1 : 3);
    }
    if (scenario !== 'empty') assert.equal(destroyed, 1);
  });
}
