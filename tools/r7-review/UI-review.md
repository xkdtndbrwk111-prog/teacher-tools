# R7 tool UI overlay — review only, 2026-11-16

Apply after the existing signed V1.65.1 base plus board R7 patch (README.md and manifest-review.json). The original R7 manifest and the stable feed remain unchanged.

- Run `python3 tools/r7-review/apply-tool-ui.py PATH/system/dashboard.html` exactly once on the confirmed R7 dashboard.
- Input SHA256: f44b8f19d77fcbb0f22871c598b95bc574614ae0e588032afa86244a98192ebe
- Output SHA256: 28035d7c1f72c214c897b1ebe51ae8a448e33b11cd77f182cbc12c640b0ec529
- Existing R7 60 mock scenarios rerun PASS; dashboard 41 inline scripts + seating inbox 1 syntax PASS. UI VM 17 checks PASS; offline Chromium 24 checks PASS with mock APIs and in-memory storage, no network, no real school data and zero page errors after correcting timetable fixture. Tests are not Windows/PowerShell or installation certification.
- Tool direction stored in existing class-layout. Old backup defaults horizontal. Edit Done saves; Cancel restores snapshot. Direction-specific minimum and clamped rotated rectangle; other widgets retain geometry. Long vertical bar scrolls and edit-only up/down scrolling is available when necessary. Overlaps are highlighted in red, not automatically rearranged. Same stable classkit ID, school facade icon and new label 앱관리. Hoja uses earless SVG with filled rounded muzzle. No coin, student, signing, update, release or installer change.
- Still HOLD: actual Windows PowerShell 5.1, production-free 3-module live E2E, physical touch/audio, backup/restore, installer/rollback. This is not an installable signed update.

Node VM regression: `node tools/r7-review/test-tool-ui.cjs PATH/system/dashboard.html`. Offline Chromium test: `python3 tools/r7-review/test-tool-ui-browser.py PATH/system OUTPUT_DIR` (Playwright + Chromium; inline local scripts, in-memory storage and mock APIs; no external navigation). Repeated test counts are not independent end-to-end coverage.
