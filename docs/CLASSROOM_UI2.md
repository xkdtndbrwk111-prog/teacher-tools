# Classroom Manager UI 2.0 — stage A candidate

Base: V1.66.19 release main. No main/stable publishing.

- Default 2×2 home; shared HUD four tabs, home button. Explicit `?section=seating` for existing direct workflows. Grade class-switch resume retained. Public student and board views bypass teacher shell.
- Startup gate covers partially mounted HUD until all existing scripts and shell are ready; no wait for external Google or board connection.
- Board center exposes original confirmed seating/roster/group transfer using original action button; no new student write protocol. Offline is not proof installation is absent; hub download link is an 안내 (official download remains unavailable). Existing settings remain.
- Existing grade flush and life exit/auth gates must stay authoritative, no bypass. Candidate browser verification required.
- UI2 next stages: extract actual HojaBoard shared color/font/radius/control/SVG tokens (new shell currently uses legacy palette); migrate all manager surfaces including grade iframe. Independent roster-only transfer requires audited safe protocol. Read-only local theme bridge, validated design-only fields and stable revisions, EASY same-device cache, NORMAL account-scoped Google preference via existing approved storage/auth. EASY cross-device theme not required. No new board Google login. No runtime or production publication in this stage.

## Stage B candidate — actual palette contract
- Five palettes extracted from the actual V1.66.19 dashboard HTML; source-parity test against the original. Custom colors use the board's mix ratios, with role-based contrast for readable manager surfaces; font names strictly validated, fallback if absent.
- Local UI theme settings, shared shell/home/settings/grade toolbar/life toolbar styling, same-origin grade frame messages, local browser restore. No board or Google synchronization yet. Do not claim full migration of legacy work surfaces; data colors, dense grade grid, charts and student views intentionally unchanged pending complete visual regression.

## Stage C candidate — local one-way bridge
- Board publishes only committed active theme/font/custom fields to same-origin POST /api/theme/publish; manager GET /api/theme is allowlisted CORS, no cross-origin writes, 45s stale rejection, in-memory server state only. Poll 5s, theme changes only, default auto on, independent option and offline cache. EASY local sync does not need Google. Board font name falls back if unavailable.
- Tests cover publisher projection, ASCII transport, PowerShell parser/normalizer, browser mock sync/offline/opt-out. Actual Windows local server end-to-end still required. NORMAL Google preference storage remains separate. Runtime candidate version advanced to V1.66.20 for unsigned builder. No main merge, signing approval or stable publish. First CI exposed a replacement-string corruption in server.ps1 and version guard failure; corrected from clean base.

## Stage D candidate — NORMAL theme file
- Existing NORMAL identity/session + drive.file scope; one app-created private JSON design preference file per verified owner, separate from yearly class spreadsheet. Scoped browser cache, default auto, account switch and logout isolation; first cloud read before automatic board updates, offline Google failure preserves usable local theme. Only actual changed preferences trigger writes. Duplicate/foreign files cause failure rather than overwrites. No OAuth scope expansion. Last explicit change/live board is authoritative in auto; no cross-device conflict encryption or atomic CAS for appearance settings.
- Simulated Drive tests plus exact signed-runtime Windows HTTP theme test added. No real Google calls during development; actual separate PC account restore still a field gate.

## Stage E candidate — independent roster transfer
- Explicit capability rosterProtocol=1, original confirmed seating unchanged, roster-only popup with distinct endpoint. Strict design of classId, student ID, name, gender, number, exclusion; no grades or other metadata. Same class retains valid seat/group geometry and filters removed/excluded seats; new class never inherits old groups. Roster-only does not mark the initial confirmed-seating link. Existing revision checks and ledger untouched. Automated unit/HTTP checks required before release.

## Stage F candidate — wider teacher design migration
- Teacher workspaces, tool docks, shared student strip, life side, controls, settings and grade iframe share palette roles and font; dense work paper is a light tint from the same palette to preserve existing semantic data colors. Existing gender/group colors, grade cells, graph colors, warning/error and public student views retained. Static primary/settings/PE/life/grade navigation SVG icons without replacing button identities. This is a targeted chrome/work-surface pass, not a claim that every legacy hardcoded color or icon was removed.
- Roster-only board playback gives explicit no confirmed seating message. Add five-theme surface browser checks and full existing classroom regression workflow. No deployment until checks reviewed.

## Stage G — text-role constraint and regression fixes
- HojaBoard-compatible vocabulary: primary, secondary, accent, alert, on-fill. Background-specific contrast correction, shared semantic tokens; no new raw color values in shared theme CSS color declarations. Work paper stays derived from same theme. Legacy semantic colors and public scenes remain exceptions; old isolated CSS is not yet completely rewritten.
- Grade workspace override matches mount-guard specificity. Student presentation button keeps glow without scaling (stable hit target). Full regression installs locked Firebase dependencies; sheet regression reads full HUD status and excludes only exact local bridge endpoints from Google-network assertions, with separate theme-specific mock coverage. No production deployment.

## Stage I — actual presentation lifecycle
- Legacy browser suites now drive the actual popup, check no opener/teacher/back buttons, test 30 names/PE/animation/touch geometry. Real presentation tracking shared by idle lock and Google pending conflict; popup handles remain until closed, failed startup removed; HojaBoard receipt refreshed every 5s with 20s freshness. Deferred conflict opens only after display ends and teacher is unlocked. Manual locking unaffected. Fix inherited two-row HUD gap. Latest CI required; not released.

## Stage J — public-only return controls and two-row HUD sizing
I regression 12/13 workflow PASS, 9 detailed failures. Eight stopped early on strict return-button count: inactive playback engine controls remained in DOM (already CSS-hidden). Remove all three controls after both engines bind, regardless of type; hidden editor inert, suppress Escape and undo/redo on public display. Tests assert IDs and actual public visibility after Escape. HUD explicit 104px two-row sizing accounts for border and mode strip padding, plus diagnostic geometry without clipping. Retest; not a PASS claim until actual results.

## Stage K — crash regression diagnostics
J passes 12/13 workflows, seven of eight full-regression jobs (browser 37/38), sole restore-interruption timeout, not a demonstrated data mismatch. Wait for actual CDP crash event, dispose crashed tab while retaining browser context/database, never bypass single-tab lock. Assert original persisted roster and grade workspace before opening grade iframe, then compare actual score over all eight original crash delays. Startup guard reports actual block/stack and disables partial teacher UI on startup failure. No production store transaction change, no relaxation of atomicity or tab protection. Re-run latest workflows before release.

## User field feedback — single-row HUD and privacy candidate
- Four top-level menus in one 60px HUD; seating unfolds into classroom/PE in its own slot (reusing existing button/event identities), only one visible route selected, no connection-as-selection. Compact widths use a work popover and smallest widths icon-only menu, class/cloud still accessible through settings. Derived action fill uses original synced accent darkened until white text contrast >=5.5; raw board palette unchanged. Remove redundant electronic-board settings category, preserve monitor placement in board center and original hidden send/status nodes. Privacy · data panel describes actual EASY, NORMAL drive.file/Sheets, theme JSON, separate Cloud Run/Firestore survey storage, local board, Supabase usage counts, deletion boundaries and contact; not a claim of formal policy certification or complete server deletion support. Web-only changes, signed runtime V1.66.20 unmodified. Retest before merge.
