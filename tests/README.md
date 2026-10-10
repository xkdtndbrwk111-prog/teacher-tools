# Verification

Run from repository root with Node.js 22+ and Playwright available (`NODE_PATH` can point to an existing installation). The browser suites use installed Google Chrome with isolated temporary profiles, never the user's browser profile.

1. Serve the repository's parent: `python3 -m http.server 8876 --bind 127.0.0.1 --directory ..` (checkout directory must be named `teacher-tools`).
2. Create scratch output directory: `mkdir -p work`.
3. `node tests/engine.mjs`
4. `node tests/seating-browser.cjs`
5. `node tests/seating-animation.cjs`
6. `node tests/hanja-browser.cjs`
7. Feedback Board: also serve on the allowed Hub origin, `python3 -m http.server 8123 --bind 127.0.0.1 --directory ..`, then `node tests/feedback-auth-bridge.cjs`. It runs `tests/feedback-auth-bridge-harness.js` (session-bridge security, no Project B/Google traffic) and `tests/feedback-board-harness.js` (ported board against the TEST Feedback dataset via public reads; every Project B call goes to an in-page mock; nothing is written). Both harnesses can also be loaded into a served Hub page and run with `await runFeedbackAuthBridgeHarness()` / `await runFeedbackBoardHarness({owner:true})`.

Reports and screenshots go to ignored `work/`. Fixtures only exist in isolated browser profiles. No real student data is used; only the Feedback suite reads the TEST Feedback dataset (public, read-only). Playback tests wait for actual animated completion.
