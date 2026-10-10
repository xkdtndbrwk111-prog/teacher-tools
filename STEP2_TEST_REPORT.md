# STEP 2 Test Report

> HISTORICAL / SUPERSEDED: STEP 2 snapshot. External URLs, Pages publishing and Feedback are now in Production; see `docs/project-b/FB_HUB_1_FINAL_REPORT.md` and `docs/DEPLOYMENT.md`.

Date: 2026-10-05 (Asia/Seoul)

## Environment

macOS, installed Google Chrome 154.0.8037.93, Playwright headless, isolated temporary browser profiles. HTTP server: `http://127.0.0.1:8765/teacher-tools/`. No public deployment. Desktop/tablet/mobile viewport widths: 1280, 768, 390, 320; mobile touch emulation also exercised.

## Browser results

| Test | Result |
|---|---|
| Hub loads with six registry cards | PASS |
| Missing URLs and development cards do not navigate by mouse/Enter | PASS |
| Desktop/tablet/mobile grid and overflow | PASS |
| Keyboard skips non-interactive cards and opens Seating | PASS |
| Seating direct load and refresh under repository prefix | PASS |
| Save and reload restore | PASS |
| Undo and redo via UI | PASS |
| Generate and confirm complete unique seating | PASS |
| History snapshot viewing and return | PASS |
| Teacher avatar UI | PASS |
| JSON Export download | PASS |
| JSON Import restores exported state | PASS |
| Corrupted import rejected without storage mutation | PASS |
| Public playback, simple view, JPG export | PASS |
| All 175 copied assets served under /teacher-tools/seating/ | PASS |
| Dynamic student/teacher/playback assets, no failed or external requests, no console errors | PASS |
| Disabled and unconfigured cards do not navigate on touch | PASS |
| Hub works with browser storage access blocked | PASS |

The Export/Import check compares the imported state with the existing approved import normalization (which adds `legacy: false` to full history snapshots). The initial overly strict raw-object comparison was corrected in the test harness; Seating code was not changed. A missing Hub favicon request was fixed by adding a local SVG icon. The final full run had zero console errors, page errors, failed resource requests, or external runtime requests.

## Static and visual verification

- PASS: all 178 Seating files match the approved ZIP byte-for-byte (3 entry files + 175 assets). Full SHA-256 inventory: `docs/SEATING_SOURCE_MANIFEST.json`.
- PASS: Hub HTML/CSS/JS are local, with no third-party runtime dependency, telemetry, privileged credentials, API calls, or storage access.
- PASS: Seating source scan found no fetch, XMLHttpRequest, WebSocket, beacon, remote URL, or localStorage.clear call.
- PASS: six registry entries, three unconfigured active external URLs, two disabled development entries.
- PASS: desktop and mobile screenshots inspected for readable layout; exported JPG inspected as a usable classroom seating chart.
- PASS: browser rendering exercised dynamic student sprites, teacher avatar layers, and public playback assets; all 175 asset URLs returned HTTP 200 under the repository subpath.

## Limits / not tested

- Actual GitHub Pages hosting: NOT RUN (public rollout prohibited in STEP 2).
- Safari, Firefox, real iOS/Android hardware, assistive technology: NOT RUN. Mobile checks are Chrome emulation.
- Project A / Project B / Feedback navigation and authentication: BLOCKED by missing actual Production URLs; registry values remain null.
- Full animated 1x/5x playback and every dialogue sequence: NOT RUN; public view, instant completion, simple view and JPG export were exercised.
- STEP 1B full persistence fault-injection matrix, all allocation rule combinations, all avatar combinations: NOT RE-RUN. Original source is byte-identical; integration smoke and corrupted import rejection passed.
- Namespace is not browser-enforced isolation. The Hub does not read classroom data; same-origin JavaScript technically could.

## Delivery gate

Implementation and local integration checks pass. Submission is based on user-created main commit `29633ed0652f4965ef506b037a50f5df43f17add`. The STEP 2 snapshot is submitted on `codex/step2-hub` through the connected GitHub API because command-line Git lacks authenticated push credentials. Only the feature branch is written; main is not modified, merged or deployed. Actual external Production navigation remains untested until the three URLs are supplied.
