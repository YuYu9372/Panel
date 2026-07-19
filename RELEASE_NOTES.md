# Release Notes

## 1.0.0-beta

The first packaged release — Panel now ships as a standalone macOS app.

### Added
- **Full-screen macOS app (`.dmg`).** An Electron wrapper starts the Python
  server and opens a kiosk window. Build with `npm run dist`; needs the system
  `python3`.

### Fixed
- **Clock drift.** Ticks now re-align to the wall clock every second instead of
  free-running, removing the 1–2 s lag.

---

## 0.4.2

### Added
- Time-based dark mode: dark 18:00–05:00, light otherwise.
- Night owl 🦉 in the "Good Night" greeting during 00:00–04:00.
- Task folders laid out in a grid with due-date colors.
- Calendar event times shown as a 24h range (HH:MM ~ HH:MM).

## 0.4.1

### Added
- UV index in the weather widget, with a color-tier background by UV band.

## 0.4.0

### Changed
- Replaced the AI chat widget with direct Composio MCP calls (no LLM, zero
  Anthropic tokens).

### Added
- Calendar widget: vertical timeline of upcoming Google Calendar events.
- Tasks widget: Google Tasks by folder; checkbox completes and syncs back.
- System status moved into the top bar as compact chips.
