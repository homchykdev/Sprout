# Plan: On-device video transcoding (Media3 + mediabunny), cloud as fallback

## User decisions (2026-11-09, override where noted)

- **Resolution is never reduced.** Device path keeps original pixel dimensions.
- Levers, in order: 1) codec/format change, 2) bitrate, 3) fps -> 30 **only with
  explicit confirmation** (settings select "Как есть" by default; choosing 30 asks a
  confirm dialog). Default = keep fps.
- **Bitrate: VBR, target = source bitrate x 0.4 (standard ~60% reduction), x 0.25 max
  (~75-80% reduction)** — low-motion clips, modern codecs keep quality. Guard: bpp
  floor and "skip conversion when gain < ~10%".
- **No browser (Playwright) verification** — user waived DoD item 2; gates are
  typecheck/lint/test/build + Android build note.

- **Android (Capacitor build):** new local plugin on **Media3 Transformer** — hardware
  MediaCodec encoding, ~3–6 MB APK growth (verify; enable R8 if over budget).
- **Browser / WebView:** **mediabunny** (~0.2 MB, lazy-loaded) over WebCodecs.
- **Cloud ffmpeg-api.com stays as fallback** (key + argv editor stay in Settings).
- No new keys, no upload: video ≤30s/≤50MB is compressed on device before IndexedDB.

Priority chain in `addFiles` (pure decision function, unit-tested):

```
mode = "off"            -> store original
mode = "device" (new default):
  1. native + Media3 plugin available   -> plugin
  2. WebCodecs + mediabunny can encode  -> mediabunny
  3. cloud key present                  -> existing ffmpeg-api.com flow
  4. store original
mode = "cloud"          -> existing cloud flow -> original on failure
```

## Target settings model (store v13 -> v14)

New fields (zustand persist, `src/lib/store.ts` + migration + backup keys):

- `transcodeMode: "device" | "cloud" | "off"` — default `"device"`
- `deviceCodec: "auto" | "hevc" | "vp9" | "avc"` — default `"auto"`
  (auto = try av1 -> hevc -> vp9 -> avc via capability probe; av1 rarely available on device)
- Existing `ffmpegKey / ffmpegOptions / ffmpegOut` unchanged (cloud fallback + advanced argv).
- Existing simple fields (`scale`, `fps`) reused for the device path; ffmpeg `codec`
  preset select stays cloud-only.

`src/lib/video-rules.ts` gains pure mappings (no DOM): settings -> mediabunny options
(height/fps/codec list/quality), settings -> plugin params, and the priority-chain
decision function given a capabilities object. All unit-testable without a browser.

## Steps (each ends with a green build + commit)

1. **feat: pure transcode decision + settings model**
   - `src/lib/video-rules.ts`: `TranscodePath`, `pickTranscodePath(caps, opts)`,
     `deviceHeight(scale)`, `codecPreferenceList(deviceCodec)`.
   - `src/lib/store.ts`: v14 migration, new fields, `TranscodeOpts` update.
   - `src/lib/backup.ts` + `__tests__/backup.test.ts`: carry new keys.
   - Tests: `__tests__/transcode.test.ts` (decision chain, mappings).

2. **feat: mediabunny local conversion (web path)**
   - `pnpm/npm i mediabunny` (zero-dep, lazy `import()` like `heic2any`).
   - New `src/lib/transcode.ts`: `convertVideoLocal(file, opts, onProgress)` with same
     `ConvertedVideo` shape as cloud `convertVideo`; capability probe
     (`getFirstEncodableVideoCodec`), MP4/WebM container auto-match.
   - Wire into `src/lib/media.ts` `addFiles` chain; gallery passes new opts.

3. **feat: Media3 Transformer Capacitor plugin (Android path)**
   - `android/app/src/main/java/sports/sprout/app/TranscodePlugin.kt`:
     `@CapacitorPlugin(name="Media3Transcode")`; `convert(inputPath, height, fps, mime)`
     -> output path; progress events; on encoder failure retry H264, then reject.
     Gradle: `androidx.media3:media3-transformer` + `media3-effect` (versions from
     current docs at implementation time).
   - `@capacitor/filesystem` (official, tiny) to move blob <-> cache file across bridge.
   - New `src/lib/native-transcode.ts` (pattern of `native-tts.ts`): bridge wrapper,
     graceful absence when not native.
   - Wire into the decision chain before mediabunny.

4. **feat: settings UI for transcode mode**
   - `src/components/game/settings/VideoGroup.tsx`: mode switch (На устройстве /
     Облако / Выкл), device codec select; cloud key + argv editor visible when
     mode allows cloud. Update copy.

5. **chore: verify, screenshot, docs**
   - Definition-of-done pass (below); APK size check before/after (R8 if > budget).

## Files

- New: `src/lib/transcode.ts`, `src/lib/native-transcode.ts`,
  `android/.../TranscodePlugin.kt`, `__tests__/transcode.test.ts`
- Edit: `store.ts`, `video-rules.ts`, `media.ts`, `backup.ts`, `gallery.tsx`,
  `VideoGroup.tsx`, `backup.test.ts`, `android/app/build.gradle`, `package.json`
- Untouched: `ffmpeg.ts` / `ffmpeg.functions.ts` (cloud fallback keeps working)

## Risks

- **Media3 fps control** (`FrameDropEffect`) — exact API to verify in docs; worst case
  fps is honored only where the effect supports it (scale+codec still apply).
- **AV1 on device**: mostly unavailable; auto mode falls to hevc/vp9 — compression
  close to current AV1-webm default, much faster than CPU SVT-AV1.
- **Base64 across the bridge** (≤50 MB files): two hops via cache files; acceptable
  for 30 s clips, flagged if slow on real hardware.
- **Old WebViews without WebCodecs**: handled by chain (Media3 -> cloud -> original).
- **APK size**: Media3 artifacts ~3–6 MB; if over budget, enable R8 minification.
- Several lockfiles exist (bun/pnpm/npm); install via npm to match `android:sync`.

## Out of scope

- Removing ffmpeg-api.com (stays as fallback), batch re-transcode of stored videos,
  iOS plugin (Media3 is Android-only; iOS gets mediabunny path).

## Verification

1. `npm run typecheck && npm run lint && npm run test && npm run build`.
2. Playwright: dev server, real .mp4 import at each mode; screenshot 390px + 1440px;
   console clean; progress state while converting; failure path (broken file) shows
   fallback/original.
3. Android: `npm run android:sync` + build, convert on device, compare size
   before/after, check battery/heat and APK delta.
