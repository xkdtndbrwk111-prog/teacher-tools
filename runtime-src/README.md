# Canonical R8 program source
This tree holds only the allowlisted runtime program files. Seeded once from the immutable, already uploaded reviewed V1.66.3 snapshot. No school data, user settings, signing keys or installer bootstrap.
For future changes edit individual files in system/, update release.json and the dashboard release label together, open a PR, and merge after reviews. GitHub Actions generates the unsigned full snapshot directly from this tree and the current signed ancestry. Clients download only changed files. Do not manually upload full ZIPs for normal releases.
The first snapshot can be built while the live feed is unreleased. Existing approved ancestry is enforced. The production signing workflow is still explicitly gated on actual Windows field validation; no unsigned candidate or test key should be published.

## Publish after validation
After successful main source build and native Windows verification, create a reviewed release-approval.json record on main via PR. Fields: schema=1; source_sha (validated main commit); artifact_id, archive_sha and payload_sha (exact successful main build); windows_run_id (same commit, successful main Windows run); field_gate=true only when actual Windows install/update/rollback and R7 integration evidence is recorded; evidence object with individual nonempty windows_install, windows_update, windows_rollback, r7_integration observations. The gated publish workflow binds source tree and candidate digest to these immutable inputs and calls the existing signing/publishing workflow. No owner ZIP transfer or manual workflow dispatch is needed. Do not create an approval record for an unverified field gate; a failed validation leaves the feed unchanged. The existing signing environment can still require its configured approval. 

## First operational pilot (one-time)
The owner explicitly authorized the exact V1.66.5 candidate for initial operational publication with physical school-PC field checks pending. The separate first-pilot-approval.json is not a field-pass attestation. The authorization is bound to the exact source commit, artifact, manifest, all four successful main CI runs and the previously unpublished feed. Ordinary releases still require the normal field gate. Production signing, independent signature verification, ancestry, allowlist, exact hash validation and atomic publication remain unchanged. The first pilot is not a successful physical school installation or a real student-data test.

## V1.66.6 foreground and weather regression
New UI foregrounds use the five semantic text roles. Rain/thunder override the seasonal particle layer, not the selected seasonal background. Missing/stale weather returns to normal seasonal particles; preserve existing reduced-motion and disabled-background controls. The weather engine's deterministic regression is `node tools/weather-particles/test.cjs`. The live candidate will be validated against the exact currently signed runtime rather than only the legacy first seed.

## V1.66.6 owner-field-test rollout
The owner requested publication of the reviewed V1.66.6 before physical visual verification. The exact V1.66.5 signed prior feed and five successful main CI runs are required. This is a one-time owner-pilot authorization, not a field-pass attestation; future ordinary releases retain the normal field gate. Existing signature, archive, ancestry and atomic publication checks are unchanged.

## V1.66.7 widget visual contract
Dashboard widgets inherit the common panel and text roles, including checklist and grape overview. Checklist progress is represented by its colored bottom progress strip and existing completion ring; the grape enlarged paper sheet retains its artwork. UI font shorthands use --tt-font with system fallback. Standalone seating receiver status has no board font preference and remains independent. Natural shadows reuse the cached sky calculation and are updated on a low-frequency timer; editor and completion effects remain separate. Precipitation animation uses existing source sprites; the heavy rain lower cloud edge is reconstructed only where previously overlapped by rain. New browser regression checks the themes, typography, direction and pixel frames. No student data in test fixtures.

## V1.66.7 owner operational pilot
Exact source/manifest and prior signed V1.66.6 inventory required, five successful main CI checks (source builder includes publisher tests), actual physical classroom visual checks pending. Owner requested release. Ordinary field gate unchanged. No manual ZIP.

## V1.66.8 education activities
Imported NEIS and weekly schedule sources have distinct labels. The date editor shows existing imported rows and local editable text. Hide/restore modifies only scoped local calendar presentation; identity includes school, grade/class, source, weekly sheet, date and exact trimmed name. Full backup includes the local hidden list; settings-only does not. Signed feed remains unchanged until candidate testing and release approval.

## V1.66.8 owner operational pilot
Owner requested release of education activity display and local visibility management. Requires exact signed V1.66.7 prior feed and six successful main checks, including dedicated education activity browser regression. Physical school-PC check pending; field gate remains false. Independent signing, ancestry and atomic publishing unchanged. No manually uploaded ZIP.
