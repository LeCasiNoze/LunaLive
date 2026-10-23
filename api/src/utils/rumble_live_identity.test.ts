import test from 'node:test';
import assert from 'node:assert/strict';
import { sameRumbleLive } from './rumble_live_identity.js';

test('Belvaa public permalink and relay slug share one verified HLS source', () => {
  assert.equal(sameRumbleLive(
    { videoId: 'v7f41yu', videoIdNumeric: '448646646' },
    { videoId: 'v7haewc', videoIdNumeric: '448646646' },
  ), true);
});

test('a new live cannot reuse the previous live playlist', () => {
  assert.equal(sameRumbleLive(
    { videoId: 'v7f41yu', videoIdNumeric: '448646646' },
    { videoId: 'v7haewc', videoIdNumeric: '448646647' },
  ), false);
  assert.equal(sameRumbleLive(
    { videoId: 'v7f41yu', videoIdNumeric: '448646646' },
    { videoId: 'v7f41yu', videoIdNumeric: '448646647' },
  ), false);
});

test('without both numeric identities only an exact slug can reuse the playlist', () => {
  const cached = { videoId: 'V7F41YU', videoIdNumeric: '448646646' };
  assert.equal(sameRumbleLive(cached, { videoId: 'v7f41yu', videoIdNumeric: null }), true);
  assert.equal(sameRumbleLive(cached, { videoId: 'v7haewc', videoIdNumeric: null }), false);
  assert.equal(sameRumbleLive({videoId: null, videoIdNumeric: null}, {videoId: null, videoIdNumeric: null}), false);
});
