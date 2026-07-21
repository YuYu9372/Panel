# Panel

## Run

```bash
python3 serve.py
```

Then open [http://localhost:8642](http://localhost:8642).

### Or run it as a Mac app

Package Panel into credential-free manual and automatic-update artifacts:

```bash
npm install             # once, pulls Electron + electron-builder
npm run dist            # dist/0.5.2/Beta_B: DMG + automatic-update ZIP
```

Open the `.dmg`, drag **Panel** to Applications, and launch it — it opens full-screen (kiosk) and starts the Python server for you. Needs the system `python3` (the app tells you to install it if it is missing). During development, `npm start` runs the same window without packaging.

The installer never contains API credentials. Click the gear beside the Wi-Fi
indicator to open **Settings → Connections**, then enter the Anthropic API key
and Composio MCP token for that Mac. Credentials are encrypted with macOS
`safeStorage`, stay outside the signed app bundle, and are never returned to the
dashboard renderer. The Composio MCP URL is fixed by Panel and is not a user
setting.

The **Updates** tab selects Stable or Developer releases on each Mac. When a
verified update exists, a download icon appears to the left of Wi-Fi and opens
the update details card. See [docs/UPDATES.md](docs/UPDATES.md) for the signed
full-update and restricted UI hot-patch workflow.

The English [operations manual](docs/OPERATIONS.md) covers routine development,
status color changes, testing, builds, installation, releases, hot patches, and
recovery. CPU, GPU, RAM, Temperature, and Wi-Fi tiers are defined in the
validated `config/status-colors.json` file. Every successful `npm run dist`
copies the manual and JSON into `dist` and the current version's build folder.

The Python server exposes local CPU, GPU, RAM, and temperature data to the system-status readout, calls the fixed Composio MCP service directly for Google Calendar and Google Tasks (no LLM), and proxies the Anthropic API only for the greeting line. On macOS, RAM comes from `vm_stat` and `sysctl`, while Apple Silicon temperature comes directly from the read-only SMC sensor interface. Neither reading needs `psutil`, sudo, or a separate monitoring app. Unsupported sensors are shown as unavailable.

Calendar and Tasks refresh at the interval selected in Settings (15 minutes by
default). Click either widget's "Updated … ago" text to refresh it immediately.
For browser-only development, `.env.example` documents the two optional
credentials. Everything degrades gracefully when a key is missing.

## About

A personal info dashboard, always on, shown fullscreen on a small screen.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current: **0.5.2_B**

- Added Stable and Developer update channels per device.
- Added the update icon and anchored release-details card beside Wi-Fi.
- Added signed full-App update support with DMG, ZIP, channel metadata, download
  progress, and restart-to-install.
- Added restricted Ed25519-signed UI hot patches with expiry, compatibility,
  anti-replay sequences, atomic activation, health checks, and rollback.
- Kept API credentials outside both update artifacts and patch data.
- Changed Wi-Fi colors to green below 20 ms, yellow from 20 to below 30 ms,
  red from 30 to below 41 ms, and purple from 41 ms upward.
- Moved all CPU, GPU, RAM, Temperature, and Wi-Fi color ranges into a validated
  JSON file that is used directly by the dashboard.

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
