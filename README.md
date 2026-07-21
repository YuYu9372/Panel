# Panel

## Run

```bash
python3 serve.py
```

Then open [http://localhost:8642](http://localhost:8642).

### Or run it as a Mac app

Package Panel into one credential-free full-screen `.dmg`:

```bash
npm install             # once, pulls Electron + electron-builder
npm run dist            # dist/panel-0.5.2-A.dmg
```

Open the `.dmg`, drag **Panel** to Applications, and launch it — it opens full-screen (kiosk) and starts the Python server for you. Needs the system `python3` (the app tells you to install it if it is missing). During development, `npm start` runs the same window without packaging.

The installer never contains API credentials. Click the gear beside the Wi-Fi
indicator to open **Settings → Connections**, then enter the Anthropic API key
and Composio MCP token for that Mac. Credentials are encrypted with macOS
`safeStorage`, stay outside the signed app bundle, and are never returned to the
dashboard renderer. The Composio MCP URL is fixed by Panel and is not a user
setting.

The Python server exposes local CPU, GPU, RAM, and temperature data to the system-status readout, calls the fixed Composio MCP service directly for Google Calendar and Google Tasks (no LLM), and proxies the Anthropic API only for the greeting line. On macOS, RAM comes from `vm_stat` and `sysctl`, while Apple Silicon temperature comes directly from the read-only SMC sensor interface. Neither reading needs `psutil`, sudo, or a separate monitoring app. Unsupported sensors are shown as unavailable.

Calendar and Tasks refresh at the interval selected in Settings (15 minutes by
default). Click either widget's "Updated … ago" text to refresh it immediately.
For browser-only development, `.env.example` documents the two optional
credentials. Everything degrades gracefully when a key is missing.

## About

A personal info dashboard, always on, shown fullscreen on a small screen.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current: **0.5.2_A**

- Added a manually opened Settings screen matching the dashboard design.
- Added encrypted per-device Anthropic and Composio credentials, mask/reveal
  controls, and connection tests.
- Made the Calendar and Tasks refresh interval configurable from 1 to 1440
  minutes, with a 15-minute default and click-to-refresh retained.
- Replaced private/public installers with one credential-free DMG.
- Kept the Composio MCP URL fixed inside Panel.
- Restored the weather icon and clock graphics under the stricter app security
  policy, and removed the frame around the Settings gear.

### 0.4.2

- Time-based dark mode (dark 18:00–05:00, light otherwise; auto-switches while running)
- Night owl 🦉 in the "Good Night" greeting during 00:00–04:00
- Top bar: time-based greeting (AI line, local fallback) + wifi state
- Bottom dock: device uptime, live system values, and 12-window status history
- 2 × 2 grid: clock, weather, calendar, tasks
- Weather: UV index with a color-tier background (blue / green / yellow / red by UV band)
- Calendar: vertical timeline of upcoming Google Calendar events
- Tasks: Google Tasks by folder, with checkboxes that complete and sync back
- Calendar + tasks read the Composio MCP directly — no LLM, zero Anthropic tokens

Full version history in [plan.md](plan.md).

## Coworkers
- YuYu9372
- Claude
