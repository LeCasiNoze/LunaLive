import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const cached = new Map<string, Promise<string[]>>();

export function supportedHlsOptions(help: string): string[] {
  const has = (name: string) => new RegExp(`(?:^|\\n)\\s*-${name}\\s`).test(help);
  const result: string[] = [];
  if (has('allowed_extensions')) result.push('-allowed_extensions', 'ALL');
  if (has('allowed_segment_extensions')) result.push('-allowed_segment_extensions', 'ALL');
  if (has('extension_picky')) result.push('-extension_picky', '0');
  return result;
}

/** Probe the binary actually used for capture, once; options vary by build. */
export function getHlsInputOptions(binary: string): Promise<string[]> {
  let result = cached.get(binary);
  if (!result) {
    result = execute(binary, ['-hide_banner', '-h', 'demuxer=hls'], {
      timeout: 5000, windowsHide: true, maxBuffer: 128 * 1024,
    }).then(({ stdout, stderr }) => supportedHlsOptions(stdout + '\n' + stderr));
    cached.set(binary, result);
    result.catch(() => cached.delete(binary));
  }
  return result;
}
