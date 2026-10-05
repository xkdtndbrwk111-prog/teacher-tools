# STEP 3A CHANGE REPORT

## Status

Implementation complete for review.

Branch:

`codex/step3a-hub-feedback`

Base:

`main`

STEP 3A has not been merged to `main` and GitHub Pages has not been enabled.

## Purpose

STEP 3A restructures Teacher Tools Hub and embeds the Production Feedback Board directly into the Hub.

Primary goals:

- Connect confirmed Project A Production URL
- Connect confirmed Project B Production URL
- Preserve approved Seating Manager
- Remove Feedback launcher card
- Embed Feedback Board at the bottom of Hub
- Keep Feedback read-only
- Keep Project C and Role Manager disabled

## Changed files

STEP 3A modifies or adds only the following files:

- `index.html`
- `hub.js`
- `hub.css`
- `feedback.js`
- `README.md`
- `docs/APP_REGISTRY.md`
- `docs/DEPLOYMENT.md`

No file under `/seating/` is modified.

## Hub launcher changes

The launcher now contains exactly five apps:

- Mario Game
- Mario Manager
- Seating Manager
- Project C
- Role Manager

Mario Game and Mario Manager use confirmed Production HTTPS URLs.

Seating Manager continues to use:

`./seating/`

Project C and Role Manager remain `development` applications with `url: null`.

Development applications are rendered as non-interactive elements and do not navigate by mouse, keyboard, or touch.

Feedback is no longer included in the launcher registry.

## Embedded Feedback Board

A new full-width Feedback section is embedded below the application launcher.

Desktop and tablet layout:

**post list → selected post/detail**

Mobile layout:

**post list → detail**

The Feedback Board loads independently from the launcher so a Feedback API failure does not prevent Hub applications from being used.

## Feedback data path

Read path:

**GitHub Pages Hub → `feedback.js` → Production Supabase public RPC**

Production Supabase project ref:

`rhtyktjebiunkchddxvg`

Read RPCs:

- `feedback_list_posts_v2`
- `feedback_get_thread_v2`

Supported functionality:

- post list
- notice badge
- post detail
- comments
- post pagination
- comment pagination
- refresh
- loading state
- empty state
- error state
- retry

The first returned post is automatically selected.

## Security boundary

STEP 3A Feedback is read-only.

The Hub does not implement:

- post creation
- comment creation
- edit
- delete
- moderation
- login
- OWNER actions

Browser code contains only a Supabase publishable key.

The Hub does not contain:

- `service_role`
- database password
- JWT signing secret
- HMAC secret
- Apps Script server secret
- OWNER credential

User-generated Feedback content is rendered with `textContent` or generated DOM nodes and is not interpreted as HTML.

Project B write/auth relay remains unchanged.

Supabase schema, RLS, write RPCs, and authentication contracts are unchanged.

## Seating freeze

The approved Seating source remains frozen.

Source:

`classroom_seating_studio_v6_24_step1b_validation_hardened_2026-10-04.zip`

Source SHA-256:

`1a3344f5e2c6cd4b5b1367b4cff4e779034c0b7f765665509e96f34e075ab282`

STEP 3A introduces no `/seating/` changes.

## Static validation completed

Repository comparison confirms the STEP 3A branch is based on the current `main` merge base and has no `/seating/` changes.

Static checks completed:

- `hub.js` syntax valid
- `feedback.js` syntax valid
- Feedback DOM IDs match `index.html`
- Hub contains exactly five launcher apps
- Feedback launcher entry removed
- Project C remains disabled
- Role Manager remains disabled
- Seating relative path preserved
- Project A Production URL configured
- Project B Production URL configured
- no Feedback write RPC referenced
- no service-role credential present
- no JWT secret embedded
- user Feedback data is not rendered with `innerHTML`
- CSS brace structure valid
- documentation updated for STEP 3A

## Production RPC verification

Production Supabase verification confirms:

- `feedback_list_posts_v2` exists
- `feedback_get_thread_v2` exists
- both RPCs are executable by `anon`
- list RPC returns `items` and `nextCursor`
- thread RPC returns `post`, `comments`, and `nextCommentCursor`
- current `feedback.js` response handling matches the Production response contract

## Remaining validation before merge

STEP 3A still requires browser smoke testing before PR approval.

Required browser checks include:

- 1280px layout
- 768px layout
- 390px layout
- 320px layout
- Project A navigation
- Project B navigation
- Seating navigation
- disabled development cards
- Production Feedback loading
- post selection
- comments
- pagination
- refresh
- error isolation
- Seating regression smoke test

After browser validation, results will be recorded in:

`STEP3A_TEST_REPORT.md`

## Merge status

**HOLD — browser validation pending**

Do not merge or enable GitHub Pages until STEP 3A browser validation and PR review are complete.
