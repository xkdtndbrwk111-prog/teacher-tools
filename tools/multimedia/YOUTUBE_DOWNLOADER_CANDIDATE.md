# YouTube Downloader — initial candidate (2026-11-19)

Base: HojaBoard V1.66.23. Draft only; not a production release.

## User-approved scope
- Multimedia menu label: 유튜브 다운로더. Existing meeting and book reader remain independent.
- External standard engine: upstream yt-dlp Windows x64, Deno, FFmpeg full build including ffprobe; official EJS components. No binaries in signed board bundle.
- Explicit first-use installation; per-user independent engine directory, video library outside runtime update slots, no elevation by default. Official sources, pinned releases/digests, staging, version checks and atomic activation, rollback to last known good.
- Download only videos for which download is authorized; no account/cookie import, DRM or access-control bypass.
- Simple URL input, 1080p default (never upscale), MP4 H.264/AAC compatibility, progress, cancellation, retry, library and offline fullscreen.

## Initial commit
Adds third multimedia tile and isolated URL validation screen using existing YouTube parser. No executable installation or launch, no network requests from screen, no new local endpoint, no runtime/release version change. Label explicitly identifies incomplete draft.

## Remaining implementation gates
1. Verify upstream URLs, licensing, signatures/checksums and Windows x64 engine combination. Independent user-consented installer with safe extraction and rollback.
2. Isolated worker process (no shell, fixed argv, normalized video ID only, no arbitrary path/flags, no cookies, bounded output, one job, timeout and cancellation including child processes). Revalidate request on server; same-origin local-only checks plus teacher authorization. Keep download processing outside synchronous PowerShell request loop.
3. Temporary job folders; ffprobe verification; atomic move to library, metadata sanitization and dedupe; media ID-only lookup, range-capable correct MIME serving, no arbitrary filesystem reads.
4. UI connection, installer progress, error/cancel/retry, library deletion confirmation and fullscreen/volume handling; no cloud/backup inclusion.
5. Tests: malformed/hostile URLs, playlists, origin/authorization, escaping/path traversal, invalid checksum, rollback, offline install error, download/merge/cancel, restart, low disk, corrupted files, library persistence, offline playback and existing meeting/book/coins/QR regression. Use authorized test media; field test on school Windows separate.
6. Candidate review and exact release approval before any signed publication. No production changes in this draft.

## 2026-11-20 — Installer implementation gate
- Engine smoke 44527013450 succeeded: pinned yt-dlp 2026.10.26, Deno 2.9.4 and FFmpeg n9.0.2-57; official asset SHA256, synthetic media merge/decode and localhost transfer verified. Actual YouTube extraction not tested.
- Last full regression: 13/14 workflows passed; Windows book label differed because emoji removal is platform-specific. Test now accepts only the exact Korean label with optional display emoji (823ae8d).
- Candidate installer implemented in tools/multimedia/youtube-engine-install.ps1, not yet packaged in signed runtime. Immutable version directory, fixed upstream SHA256, exact executable extraction, exclusive install lock, staging cleanup, manifest and installed file hash checks, idempotent reuse. Invalid existing install fails closed; explicit repair and rollback not yet implemented. No production paths used in CI.
- Windows PowerShell 5.1 real installer test registered: fresh install, reuse, executable start, corruption detection, no overwrite, staging cleanup. Results pending. Next gate: bounded asynchronous worker and board API, then UI/library. V1.66.23 unchanged.

## 2026-11-20 — worker candidate
- Previous head 8568d2a: 14/14 workflows passed, including both multimedia browsers and five real PowerShell 5.1 installer checks (run 44659492014).
- Worker library: tools/multimedia/youtube-download-worker.ps1. Strict video ID/720 or 1080 cap, canonical URL, no configuration/cookies, H264/AAC format selection, hidden process with bounded polling, process cancel/timeout, exclusive download lock, per-job status, ffprobe validation and same-volume directory commit of MP4 + metadata. Existing library entries preserved. Installer and worker are still candidate tools, NOT runtime-packaged or reachable from board.
- Worker fixture verifies strict request policy, concurrency rejection, atomic status, generated media commit, duplicate preservation, corrupt media rejection and cancellation of a running fixture process. No production paths or actual YouTube downloads. CI pending. Remaining: launcher and API authorization, safe installer cancellation/repair, stricter disk quota and child-tree lifecycle validation, UI/library serving and offline playback; field test before release.

## 2026-11-20 — board bridge candidate
- Prior head 60ea40c: 13/14 workflows passed, common badge workflow cancelled (not a pass), Windows engine/worker test 44663334295 passed all 7 new worker fixtures.
- Added localhost status/start/cancel API, exact Host + same-origin + Origin on POST + ephemeral token. Board asks existing shared teacher PIN and authorized-download confirmation before start. PIN is browser-local, not a server-side credential; stronger server authorization remains a release gate.
- Existing signed server.ps1 contains marked generated sections from installer/worker/bridge canonical tools, with CI source parity check. No package allowlist change. Worker launches the fixed server script as separate hidden Windows PowerShell process before normal server initialization. Per-user media root is separate from runtime directory. Latest-job status and validated library list are available; no file paths returned.
- Dashboard: URL validation, 720/1080 cap, start/status/cancel, teacher prompt, library list and visible messages. Browser test uses mock local responses; Windows bridge test launches synthetic offline worker process and verifies origin/token/method rejection, busy and cancel. Actual real YouTube extraction, real end-to-end localhost server and worker, integrated playback/delete, installer cancel, rollback/repair, disk quotas and production field test remain open. No deployment.
