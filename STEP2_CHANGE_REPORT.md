# STEP 2 Change Report

Date: 2026-10-05 (Asia/Seoul)
Repository: xkdtndbrwk111-prog/teacher-tools
Implementation branch: codex/step2-hub

## Added files

- `index.html`: Korean static launcher shell, semantic headings, keyboard skip link, no-script Seating fallback.
- `hub.css`: lightweight responsive card layout, desktop/tablet/mobile grids and visible focus styles.
- `hub.js`: centralized APPS registry, first-party SVG icons and navigation rendering.
- `assets/hub/favicon.svg`: local first-party icon.
- `README.md`: purpose, architecture, app states, local data boundary and hosting overview.
- `docs/APP_REGISTRY.md`: registry fields, configuration and non-interactive state rules.
- `docs/DEPLOYMENT.md`: repository-prefix paths, future branch-based Pages publishing, test checklist and commit-revert rollback procedure.
- `docs/SEATING_SOURCE_MANIFEST.json`: approved ZIP hash and every copied file's SHA-256.
- `STEP2_CHANGE_REPORT.md`, `STEP2_TEST_REPORT.md`: changes and actual verification results/limits.
- `.gitignore`: excludes local scratch/test data and macOS metadata.

## Copied Seating source

Source of truth: `classroom_seating_studio_v6_24_step1b_validation_hardened_2026-10-04.zip`.

Copied `index.html`, `styles.css`, `app.js`, and all 175 files under `assets/` into `seating/`. All 178 files are byte-for-byte identical to the approved ZIP. Historical reports and development scratch files from the archive were not published. No path correction was necessary: existing asset paths already resolve from the app directory. The manifest lists the exact copied files.

## Hub behavior

Six cards are generated from APPS in `hub.js`. Product status is only active/development. Missing or invalid URLs are configuration conditions and display ‘링크 설정 필요’. Such cards and all development cards are articles, without anchors, tabindex, mouse handlers or keyboard navigation. Development remains disabled even if a URL is accidentally supplied. Only the configured active Seating card navigates initially.

External URLs remain null for mario-game, mario-manager, feedback. No invented URL, product/source query parameter or fake functional app is included. External HTTPS URLs can later be entered in the registry. Navigation stays in the same tab.

Hub uses `./hub.css`, `./hub.js`, `./assets/hub/favicon.svg`, `./seating/`. All Seating assets remain relative to `/teacher-tools/seating/`. There are no build dependencies or external runtime scripts. No workflow file is needed for the planned branch-based Pages model.

## Preserved boundaries

Seating V6.24 UI, allocation engine, storage namespace, migration, failure protection, future-version rejection, import validation, stale-tab handling, undo/redo, history, avatars, dialogue and playback code were not changed. Hub never reads storage or classroom data. Same-origin storage is a trust boundary, not technical per-path isolation.

A/B/C sources, existing backend/authentication/deployment, Supabase, Apps Script and Feedback schema/OWNER UI are untouched. Roles and Project C have no executable implementation in this repository. No DNS, custom domain, GitHub Pages activation, merge or STEP 3 work is included.

## Review readiness

Local browser integration tests passed; see STEP2_TEST_REPORT.md. The user initialized main at `29633ed0652f4965ef506b037a50f5df43f17add`. The existing implementation snapshot is submitted with that commit as its parent on `codex/step2-hub` for PR review. The bootstrap README is replaced by the complete project README. Main is not directly modified or merged. No runtime code or Seating assets changed during submission; only these delivery notes were updated.
