# Release Notes

## 0.5.1

Native RAM and temperature readings for Apple Silicon Macs.

### Fixed

- **RAM no longer depends on the selected Python installation.** Panel now reads
  macOS virtual-memory counters through `vm_stat` and `sysctl`, so the RAM row
  works even when the Python selected by the packaged app has no `psutil`.
- **Temperature now works on Apple Silicon.** Panel reads the available CPU
  temperature sensors directly from Apple's read-only SMC interface and shows
  their average in Celsius. It does not require sudo or a
  separate monitoring app.
- **Version metadata is consistent.** The app bundle, dashboard tag, package
  metadata, and public disk-image name now report 0.5.1.

### Verified

- MacBook Pro with Apple M4 Pro and 24 GB RAM.
- Both metrics return live numeric values when Panel uses Homebrew Python 3.14
  without `psutil`.
- Existing Linux and `psutil` fallbacks remain available on other systems.

---

## 0.5.0 Beta-B (Public)

Network status, a system history dock, and a proper offline screen.

**Download:** `panel-0.5.0-Beta-B-Public.dmg` (macOS, Apple Silicon)

### Works out of the box
No setup, no account, no keys:
- Analog + digital clock with date
- Weather for Taipei with UV index and a color-tiered background (Open-Meteo,
  no key required)
- **System status history dock.** CPU, GPU, RAM, temperature, and wifi latency
  each get a 12-block, ~6-hour history strip (GitHub-contributions style), plus
  a live value and device uptime.
- **Connectivity indicator.** Wifi icon — green (fast), yellow (slow), red
  (offline).
- **Offline screen.** A big clock and "Offline" replace the dashboard when the
  connection drops; local system stats stay visible; clears itself on reconnect.
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
- The connectivity check is a raw TCP connect to public DNS servers — no data
  leaves your machine beyond that.

---

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

## 0.5.0 Beta-B

### Added
- **System status history dock.** CPU, GPU, RAM, temperature, and wifi now sit in a
  full-width bottom dock. Each metric has 12 clock-aligned **30-minute windows**: 11
  completed p95 blocks and one outlined current block using its running average. Raw live
  values refresh every ~2 s. Offline / no-reading blocks are gray.
- **Device uptime.** The dock summary shows how long the device has been running.
- **Precise history details.** Every block identifies its time range, aggregation, and
  value on hover.
- **Server-side history log.** `serve.py` samples in the background and keeps the history in
  `~/.panel/history.json`, so the strip survives reloads and restarts.

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
