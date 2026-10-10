# FB-HUB-1 — Final Report (Source of Truth)

**STATUS: PASS / COMPLETE**

FB-HUB-1 moved the visible Feedback Board from Project B into the Hub and
promoted it to Production. This file is the current state for future work.
Historical TEST procedure (@372/@373/@374) lives in
[`FB_HUB_1_RUNBOOK.md`](FB_HUB_1_RUNBOOK.md).

## Architecture

```
User
 → Hub visible Feedback Board (feedback-board.js / feedback-board.css)
 → public safe read (feedback-transport.js, Supabase public v3 RPC)
   OR Project B secure bridge (feedback-auth-bridge.js, popup + postMessage)
 → Project B server authority (Creator auth, OWNER checks, relay,
   idempotency, moderation, privileged Supabase access)
 → Production Supabase
```

- The Hub contains the **only** visible Feedback Board UI.
- **Project B has NO visible Feedback Board UI.** It is backend-only for Feedback.
- Hub app cards remain static and registry-driven (`hub.js` `APPS`); Feedback is
  the documented exception that performs public reads and bridge calls.

## Baseline

| Item | Value |
|---|---|
| Repository | `xkdtndbrwk111-prog/teacher-tools` |
| main baseline | `34f71e0a3f848c6c5c16f67fd657e4968b4c87bd` (Point Quiz Manager Hub card to Production) |
| Hub | `https://xkdtndbrwk111-prog.github.io/teacher-tools/` (GitHub Pages) |
| Project B Production deployment | `AKfycby9iWJSQhcYZncoPAvxeWm_Mk9ZvbHXcVcy_UWo6Vktbrdvwcev7rEPM3Y2X0U-SLca` |
| Project B application version | @377 (latest confirmed) |
| Project B user-frame origin | `https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com` |
| Production Supabase ref | `rhtyktjebiunkchddxvg` |
| Active-product contract | Applied (`20261007055920_feedback_product_active_contract.sql`) |
| Hub Quiz Manager card | Points to the Project B Production deployment above |

## Product registry (`feedback_products`, all ACTIVE)

`HUB`, `PROJECT_A`, `PROJECT_B`, `SEATING`, `HANJA`, `PROJECT_C`,
`ROLE_MANAGER`, `OTHER`

Legacy product-less six-argument create rejects with `FEEDBACK_PRODUCT_INVALID`.

## Production smoke matrix (PASS — do not repeat)

| Area | Result |
|---|---|
| Anonymous public v3 reads | PASS |
| Creator session / OWNER session | PASS |
| CREATE / UPDATE / DELETE post | PASS |
| CREATE / UPDATE / DELETE comment | PASS |
| Idempotent replay (same requestId) | PASS |
| OWNER PIN / UNPIN | PASS |
| OWNER post HIDE / UNHIDE / DELETE | PASS |
| OWNER comment HIDE / UNHIDE / DELETE | PASS |
| Deleted tombstones | PASS |
| `product = HANJA` | PASS |
| Disconnect / reconnect (manual: `Creator · OWNER 연결됨`) | PASS |

## Test artifacts

- Smoke A post `bf4b4515-013e-40b7-9f7f-c7092a9192df`: DELETED tombstone (rev 3).
- Smoke B post `f5695c43-48d1-4b09-85a1-85077bab07ff`: DELETED tombstone (rev 6).
- Smoke objects were removed through normal application contracts. Do not physically delete them.
- Historical canary post `c9da3839-f2c1-4f85-911b-659ca7bacb8f` remains HIDDEN on purpose. Do not change it.
- Canary relay properties and the temporary canary helper are absent.

## Invariants

- The browser never supplies actor authority; Project B derives it server-side.
- The browser never receives the service-role secret.
- OWNER authority remains server-side.
- Exact origin, nonce and `event.source` binding remain required on both sides.
- No wildcard `postMessage` target.
- No direct browser mutation RPC; all mutations go through the Project B relay.
- The Project B visible Feedback UI must not be restored.
