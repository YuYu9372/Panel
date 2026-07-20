# Release Notes

## 1.0.0-Public-beta

The first build made for sharing. Same app as `1.0.0-beta`, packaged with **no
credentials inside** — you bring your own.

**Download:** `panel-1.0.0-Public-beta.dmg` (macOS, Apple Silicon)

### Works out of the box
No setup, no account, no keys:
- Analog + digital clock with date
- Weather for Taipei with UV index and a color-tiered background (Open-Meteo,
  no key required)
- System status: CPU, GPU, RAM, temperature
- Automatic dark mode (18:00–05:00)
- Time-based greeting bar

### Optional — add your own keys
Calendar and Tasks show *unavailable* until you configure them. Edit the `.env`
inside the app (`Panel.app/Contents/Resources/panel/.env`):

| Key | Enables |
| --- | --- |
| `ANTHROPIC_API_KEY` | AI-written greeting line (falls back to local phrases without it) |
| `COMPOSIO_MCP_URL` + `COMPOSIO_MCP_TOKEN` | Google Calendar and Google Tasks widgets |

### Requirements
- macOS on Apple Silicon (arm64)
- Python 3 — the app tells you how to install it if it's missing

### First launch
The app isn't notarized, so macOS will block it the first time. **Right-click
the app → Open**, then confirm. Only needed once.

### Notes
- The local server binds to `127.0.0.1` only and its API refuses non-local
  requests — nothing is exposed to your network.
- Calendar and Tasks are fetched directly over MCP, with no LLM involved.

---

## 0.5.0

Network awareness and freshness.

### Added
- **Connectivity indicator.** A small wifi icon in the top bar — green when
  online and fast (< 30 ms), yellow when online but slower, red with a slash
  when offline.
- **Offline screen.** If the connection drops, the dashboard is replaced by a
  large clock with "Offline" in red at the bottom — still showing the local
  system stats (CPU/GPU/RAM/temp) and the version — and clears itself the
  moment you're back online.
- **Last-updated time.** Weather, Calendar, and Tasks now show when they last
  refreshed ("Updated 3 min ago"), so stale data is obvious at a glance.
- **Version tag.** The current build shows in the bottom-left corner.

### Fixed
- The local server failed to start because of a stray indentation error in the
  greeting code — Calendar, Tasks, and the AI greeting work again.
- The AI greeting no longer repeats "Good Morning!" after the greeting bar's
  own title.

---

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
