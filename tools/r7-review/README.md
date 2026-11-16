# R7 board integration candidate — REVIEW ONLY

This is a source patch for a paired R7 board runtime and `hoja-minigames` candidate. It is **not** a signed installer or automatic content update. The classroom manager changes reside on the same `teacher-tools` review branch; the public main and signed update feed remain unchanged.

## Rebuild

1. Extract the untouched `HOJA_Board_V1.64.2_R6_CMD_설치시험.zip` package into a temporary directory.
2. Replace `system/dashboard.html` with the **verified** V1.65.1 signed dashboard HTML (SHA256 `2483489b7286f7b27b4535e38e11ddd1aa4124464ce86aaa5888c7da66f841f0`).
3. Verify source SHA256 values against `manifest-review.json` and apply `board-r7-review.patch` with `patch -p1` from the extracted package root. Check the resulting SHA256 values.
4. Run Node tests against the patched `system/` files: `node test-r7.cjs`, `node test-handler.cjs`, `node test-hof.cjs`, `node test-integration.cjs`. These tests use virtual teachers and students, fake ledger and transports. **Do not point tests at real data.**
5. The complete R7 release needs fresh runtime checksums, Windows PowerShell 5.1 validation, install and rollback testing, and a paired minigame build. Do not install this patch on a classroom PC.

## Scope

`server.ps1`: optimistic coin ledger revision compare-and-write, seating revision checks, origin 4188, coin protocol v3. `coins.js`: idempotent transaction keys, school/class validation, original-class refund and tombstone for cancelled payments, whole-week settlement with team awards. `coins-ui.js`: serialized writes, class- and iframe-session-bound messages, freshness, verified refund and weekly payouts. `seating-inbox.html`: manager v3 reply and replay-safe mutations bound to class. `dashboard.html`: migrated house/internal coin writes to revision-checked path.

## Caveats

The board's server uses `X-TT-Coin-Revision` and checks a SHA256 of ledger bytes. A stale read gets HTTP 409, so a caller revalidates rather than overwrites. This only protects reads/writes using the R7 API. The server does not independently authenticate teacher operations beyond local origin; preserve the current trusted local surface. Multiple webviews/mid-flight closure are partially handled by session IDs and transaction tombstones but must be tested on a real Windows PC.

A board class remains whatever was last explicitly sent from the classroom manager; the manager candidate blocks writes when that class differs. It intentionally does not silently switch the board to a new class. Paid games only use the new v3 protocol with both R7 components. Supabase HOF records are still owned by the minigame and are not written during these tests.

For class-life STEP 12, the manager branch bases on main commit `3cc5353c47c66c958939cf1caecdca72b42b63ef`, preserving the newly merged six-digit student-code workflow. The work must be reviewed for safe compatibility before merging.