/** Pure rules for uploads: no DOM, no network — safe to unit-test. */

/** Short-clip guard: longer/heavier videos are rejected before upload. */
export const VIDEO_MAX_SEC = 30;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * HEIC/HEIF from iPhones: browsers can't decode them, so we skip
 * with a hint instead of storing an invisible file.
 */
export function isHeicFile(f: { type: string; name: string }): boolean {
  return /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
}
