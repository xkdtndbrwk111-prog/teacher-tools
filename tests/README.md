# Verification

Run from repository root with Node.js 22+ and Playwright available (`NODE_PATH` can point to an existing installation). The browser suites use installed Google Chrome with isolated temporary profiles, never the user's browser profile.

1. Serve the repository's parent: `python3 -m http.server 8876 --bind 127.0.0.1 --directory ..` (checkout directory must be named `teacher-tools`).
2. Create scratch output directory: `mkdir -p work`.
3. `node tests/engine.mjs`
4. `node tests/seating-browser.cjs`
5. `node tests/seating-animation.cjs`
6. `node tests/hanja-browser.cjs`

Reports and screenshots go to ignored `work/`. Fixtures only exist in isolated browser profiles. No real student data or remote services are used. Playback tests wait for actual animated completion.
