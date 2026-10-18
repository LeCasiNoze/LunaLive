import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedHlsOptions, getHlsInputOptions } from './hls_options.js';

test('older HLS demuxer never receives unsupported extension_picky', () => {
  assert.deepEqual(supportedHlsOptions('HLS demuxer AVOptions:\n  -allowed_extensions <string> .\n'), ['-allowed_extensions', 'ALL']);
});

test('newer builds receive the supported segment and extension controls', () => {
  assert.deepEqual(supportedHlsOptions(' -allowed_extensions <string>\n -allowed_segment_extensions <string>\n -extension_picky <boolean>'),
    ['-allowed_extensions', 'ALL', '-allowed_segment_extensions', 'ALL', '-extension_picky', '0']);
});

test('a mention in descriptive text is not a supported option', () => {
  assert.deepEqual(supportedHlsOptions('See -extension_picky for newer builds.'), []);
});

test('the installed FFmpeg build is probed and cached', {skip: !process.env.TEST_HLS_SOURCE}, async () => {
  const first = getHlsInputOptions('ffmpeg');
  assert.equal(getHlsInputOptions('ffmpeg'), first);
  assert.ok((await first).includes('-allowed_extensions'));
});
