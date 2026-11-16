# R8 assembly review — 2026-11-17 KST

Status: candidate only; no production promotion. Source tested at 1ca9daff2940021ef062059b5cfa8532b5630e25, [Windows fixture run](https://github.com/xkdtndbrwk111-prog/teacher-tools/actions/runs/43983386707), 52 assertions PASS (ephemeral RSA key; signed inventory, corrupted downloads, missing/extra files, changed files only, rollback at each possible replacement boundary). Windows PowerShell parse and Python syntax PASS. No real Windows board launch or production-key signing.

Actual assembled package: HOJA_Board_V1.66.0_R8_REVIEW_ONLY.zip, 2,326,202 bytes, SHA256 `15487952cb1508b91521a8eb4a7315b5311a6242da8d2a655a75d2b50f3fafeb`. V1.66.0 is a proposed internal candidate identity, not a published version. Candidate stored in ChatGPT artifact library, not committed as release binary.

## Reproducibility
- R6 V1.65.1 full install SHA256 6ee225053d9f716bd56829b159b1c13592dc19fb22f49ccd7cef4b81626cba1d.
- R7 integration review archive SHA256 3a18d03cc88a72a61fd417a02017455e51da233cffebc1dbb064242feacef6a2. Verify all five base hashes, apply board-r7-review.patch -p1, verify all five output hashes.
- [R7 presentation final review artifact](https://github.com/xkdtndbrwk111-prog/teacher-tools/actions/runs/43895390673), archive SHA256 fee7bc705814db6d966fb6c0a36837231ab79023204da52351dd26b52137a545. Apply R7 no-manager-grant, UI, Podo, V1653, V1654, V1655 and V1655-edge overlays in order from included R7 baseline; final dashboard checksum before presentation patch matches 7920f6eeb9e016247cbf3f2821d4ad610819691e29b0d61c2831edace407e190.
- Apply patch_dashboard, patch_server, patch_install from presentation overlay and copy four exact tested presentation runtime files from artifact; no second asset synthesis.
- Apply R8 with `python tools/r8-updater/apply-r8.py PATH/system --version 1.66.0 --release 2026-11-17-V1.66.0-STABLE-PILOT`.
- 51 installed payload entries + installer hash verified (52 hashes), presentation archive CRC and final ZIP CRC PASS. All 42 dashboard inline and 6 external JS syntax PASS. Public key copied unchanged.

## Publisher verification
Actual assembled files copied to temporary base/target, with ephemeral public key in both fixtures. V1.66.1 synthetic target changes dashboard, release metadata, server and one graphic fixture. 40-entry signed inventory, 4 changed entries selected; valid signature passes, forged signature and changed blob rejected. No operating private key used, no signed production feed created.

## Release blockers
Run on isolated Windows account/VM: actual CMD install including existing data/monitor preservation, manual update button, normal cold launch and update-toggle behavior, real HTTP download signed by test key, server/board restart both modes, failure and interruption with the actual launcher, paired R7 minigames, school touch/audio. Current readiness verifies matching release, local service and window token, not full dashboard semantic health. Manual installer and kernel/public key remain immutable from remote updates. Production key signing is a separate authorized step. Do not publish stable/runtime-v1 or replace existing stable feed until these gates are satisfied. No school data accessed or written.
