# FB-HUB-1 — Project B Feedback Board → Hub (runbook)

## FINAL PRODUCTION STATUS — COMPLETE (current)

Production promotion is **complete**. Current Source of Truth:
[`FB_HUB_1_FINAL_REPORT.md`](FB_HUB_1_FINAL_REPORT.md).

- Project B visible Feedback Board UI: **removed** (Project B is backend-only for Feedback).
- Production bridge active: Project B Production
  `AKfycby9iWJSQhcYZncoPAvxeWm_Mk9ZvbHXcVcy_UWo6Vktbrdvwcev7rEPM3Y2X0U-SLca`
  (latest confirmed application version @377); Hub `feedback-auth-bridge.js` points to it.
- Production Supabase `rhtyktjebiunkchddxvg` active for public v3 reads and relayed mutations.
- Active-product contract (`20261007055920_feedback_product_active_contract.sql`) **applied**;
  8 ACTIVE products; legacy product-less create rejects with `FEEDBACK_PRODUCT_INVALID`.
- Final Production smoke: **PASS** (Creator/OWNER CRUD, idempotent replay, PIN/UNPIN,
  post and comment HIDE/UNHIDE/DELETE, tombstones, `HANJA` product, disconnect/reconnect).
- Hub Quiz Manager card (`mario-manager`) switched from TEST @374 to Production
  (main `34f71e0a3f848c6c5c16f67fd657e4968b4c87bd`).

Everything below is the **HISTORICAL TEST PROCEDURE** (@372/@373/@374 on the TEST
deployment). It is kept as a record; do not re-run it against Production.

---

## HISTORICAL — TEST runbook

Branch: `codex/feedback-projectb-to-hub`. Project B source is not vendored in
this repository; the exact deltas against the immutable TEST @371 source are:

| File | Applies to | Content |
|---|---|---|
| `v371-to-v372.diff` | Project B TEST @371 → **@372** | Hub session bridge + registry-owned product keys |
| `v372-to-v373.diff` | @372 → **@373** | Removes the visible Project B Feedback Board UI (Phase H) |

@371 source SHA-256 (verified against the previously validated copy):
`Script.html ea392efe…`, `FeedbackSupabaseV2.js 358cb312…`, `FeedbackAuthBridgeV1.js 5bc0726a…`.

## @372 — Hub session bridge (deploy first)

Changes (server authority unchanged; every call re-checks on the server):

- `FeedbackAuthBridgeV1.js`: bridge action `CREATE_POST` → `SESSION`; adds
  `getFeedbackBridgeSessionV1(creatorToken)` → `{creatorConfirmed, creatorCode,
  ownerAvailable}` (no identity data).
- `FeedbackAuthBridgeV1Client.html`: persistent popup session. Same origin /
  nonce / `event.source` checks; allowlisted ops `SESSION, CAPABILITIES,
  OWNER_CONTEXT, OWNER_QUEUE, CREATE_POST, UPDATE_POST, DELETE_POST,
  CREATE_COMMENT, UPDATE_COMMENT, DELETE_COMMENT, MODERATE_POST,
  MODERATE_COMMENT`, each with argument validation and field-whitelisted
  results. The Creator token never leaves Project B.
- `FeedbackSupabaseV2.js`: hard-coded `SMQ_FEEDBACK_PRODUCTS_V3` allowlist
  replaced by a key-shape check (`^[A-Z][A-Z0-9_]{0,63}$`); the
  `feedback_products` registry (DB) decides existence/active. Product is now
  **required** on create (no silent default).

Note: after @372, the Project B board's own *create* (which never sends a
product) fails with `FEEDBACK_PRODUCT_INVALID` by design. Reads, edit,
comments and moderation in the Project B board are unaffected.

Deploy (from a working copy of the @372 candidate, TEST script only):

```bash
clasp push
```

```bash
clasp version "FB-HUB-1 Hub session bridge (@372)"
```

```bash
clasp deploy -i AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc -V 372 -d "FB-HUB-1 @372"
```

Use the version number `clasp version` prints if it is not 372 (and report it). Then confirm the TEST deployment id and the user-frame origin are unchanged;
both are pinned in `feedback-auth-bridge.js` (`BRIDGE_EXEC_URL`,
`BRIDGE_ORIGIN`).

## Live smoke (needs real Google sign-ins; Hub at `http://127.0.0.1:8123/teacher-tools/`)

Already verified without @372 (deterministic, see `tests/`): public TEST read,
notice, list, detail, tombstones, product display, registry selector,
required 문의 대상, product preserved on edit (incl. inactive), every
Project B call shape, OWNER UI, unknown-result retry, bridge trust rules.

Still requires a person at the browser after @372:

1. `Creator 연결` → popup → Google sign-in (approved Creator) → status `Creator 연결됨`.
2. 글쓰기 → 문의 대상 = 한자 매니저 → post appears with `[한자 매니저]`; DB row has `product = 'HANJA'`.
3. Own post: 수정 (product unchanged) and 삭제 → author tombstone.
4. Comment: 작성 / 수정 / 삭제 on own comment → author tombstone.
5. Non-owner Creator: no edit/delete on others' posts; a forged call is refused by the server.
6. OWNER account: 공지로 고정 / 공지 해제, 숨김, 숨김 관리 → 복원, 관리자 삭제 → OWNER tombstone.
7. Project B TEST page shows the same notice/list/tombstones as the Hub.
8. Popup closed mid-session: Hub calls fail as unknown → reconnect → `같은 요청 다시 확인` replays the same requestId.

## @373 — remove Project B board UI (only after the smoke passes)

Removes the dashboard Feedback card (`#usageFeedbackSlot`), the
`#feedbackBoardModal` markup and the board client module
(`installFeedbackBoardFb1_`). All callers use `window.SMQFeedbackFb1?.…`.
Kept: every server function, the Creator auth bridge include, Creator
Registry/session, OWNER checks, relay, idempotency, moderation.
Check visually: the usage dashboard without its third tier (layout CSS still
reserves tier heights; dead board CSS is left in `Styles.html`).

```bash
clasp push
```

```bash
clasp version "FB-HUB-1 remove Project B board UI (@373)"
```

```bash
clasp deploy -i AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc -V 373 -d "FB-HUB-1 @373"
```

Re-run the live smoke above against @373.

## @374 — dashboard cleanup after board removal

`v373-to-v374.diff`: @373 left the desktop usage dashboard's third grid
column (reserved for the Feedback tier) empty, and the home card / dashboard
title still advertised the Feedback board. @374 appends one CSS block that
reduces the desktop grid to two columns and renames the labels to
"사용 통계". No server file changes.

## Live TEST results (2026-10-08)

- @372: A–H live smoke PASS (Creator + OWNER account, second non-owner
  Creator for E, popup-close recovery with same requestId and no duplicate).
- Hub fixes found live: in-page OWNER confirm dialog (native confirm was
  suppressed); unanswered bridge calls end the session (STALE) and a
  matching Creator is offered the preserved PENDING_UNKNOWN retry.
- @373: Project B board UI removed; Hub list/detail, Creator connect,
  comment create, OWNER hidden queue and refresh PASS against @373.

## HISTORICAL / SUPERSEDED — Production promotion delta (planning, 2026-10-07)

> Superseded: this plan was carried out. Production promotion is complete; see
> FINAL PRODUCTION STATUS above. The text below describes the pre-promotion state.

Production Supabase `rhtyktjebiunkchddxvg` (read-only inspection 2026-10-07)
has `fb_w2_product_production_promotion` (fixed product CHECK) but **no**
`feedback_products`, `feedback_list_posts_page_v3`, `feedback_get_thread_v3`.

1. Supabase Production: TEST's current `feedback_list_posts_page_v3` /
   `feedback_get_thread_v3` definitions (paged list + tombstones + product),
   then `20261007052949_feedback_product_registry.sql`, then
   `20261007055920_feedback_product_active_contract.sql`.
2. Project B Production (@299 lineage): the bridge server
   (`smqFeedbackAuthBridgeAssertTestV1_`) and the Supabase relay are TEST-only
   by design; promotion needs an approved Production bridge/relay stage plus
   the @372/@373 deltas.
3. Hub: switch `feedback-transport.js` `CONFIG` to Production URL +
   publishable key, and `feedback-auth-bridge.js` exec URL / origin to the
   Production deployment.
