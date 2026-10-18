import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Verify the video stream, not the container (audio may outlast missing video). */
export async function verifyClipDuration(filePath: string, expectedSec: number): Promise<number> {
  if (!Number.isFinite(expectedSec) || expectedSec <= 0) throw new Error('clip_invalid_expected_duration');
  const { stdout } = await run(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'json', filePath,
  ], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
  const probe = JSON.parse(stdout);
  const duration = Number(probe?.streams?.[0]?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('clip_video_duration_unavailable');
  // Allow only a small frame/container rounding margin, not a missing HLS segment.
  if (duration + 0.25 < expectedSec) {
    throw new Error(`clip_video_too_short: expected=${expectedSec.toFixed(3)} actual=${duration.toFixed(3)}`);
  }
  if (duration > expectedSec + 0.25) {
    throw new Error(`clip_video_too_long: expected=${expectedSec.toFixed(3)} actual=${duration.toFixed(3)}`);
  }
  return duration;
}
