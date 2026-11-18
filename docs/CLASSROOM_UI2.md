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
