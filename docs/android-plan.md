# Android WebView fixes

1. Add early persistent diagnostic logging and a settings report for Capacitor, notifications, TTS, and camera.
2. Fix Android reminder permission and exact-alarm handling, configure a notification channel/icon and system-settings actions, and make schedule synchronization resilient to app lifecycle changes.
3. Use native TTS on Android while preserving browser speech and Web Audio on web.
4. Fix Android camera orientation and rear-camera selection, log capture dimensions, handle background/foreground lifecycle, and use CPU MediaPipe on Android.
5. Configure Capacitor 8 `SystemBars` insets for edge-to-edge and let `CameraStage` report the actual video and preview dimensions.
6. Check native-only service worker and server-dependent flows; change only confirmed issues.
7. Run typecheck, lint, tests, and web build. The user will rebuild/sync Android and perform physical-device checks.

## Evidence and risks

- Device logcat shows notification permission granted, reminders scheduled with `isExactNotification: false`, an interrupted notification schedule during app pause, and a Capacitor persistence error.
- The user reports that Samsung's notification permission control is disabled until granting «Будильники и напоминания»; after installing a debug build, notifications work when this special access is enabled.
- The user confirms the camera image is rotated by 90 degrees and the camera-switch control appears to mirror it instead of selecting the rear camera. The existing code rotates landscape input to portrait and trusts `facingMode: ideal`, so use native orientation as-is and strengthen camera selection.
- No device access is available to verify exact-alarm UI, TTS, notification delivery, or camera framing after changes.
- Keep camera capture video-only; do not request microphone permission based only on Chromium's generic warning.
