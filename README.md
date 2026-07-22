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
npm run dist            # dist/0.5.2/release: DMG + automatic-update ZIP
```

Open the `.dmg`, drag **Panel** to Applications, and launch it — it opens full-screen (kiosk) and starts the Python server for you. Needs the system `python3` (the app tells you to install it if it is missing). During development, `npm start` runs the same window without packaging.

The installer never contains API credentials. Click the gear beside the Wi-Fi
indicator to open the minimal **Settings** screen, then enter the Anthropic API
key and Composio MCP token for that Mac. Credentials are encrypted with macOS
`safeStorage`, stay outside the signed app bundle, and are never returned to the
dashboard renderer. The Composio MCP URL is fixed by Panel and is not a user
setting.

The **Update channel** row selects Stable or Developer releases on each Mac.
When a verified update exists, a download icon appears to the left of Wi-Fi and
opens the update details card. See [docs/UPDATES.md](docs/UPDATES.md) for the
signed full-update and declarative live-patch workflow.

The English [operations manual](docs/OPERATIONS.md) covers routine development,
status color changes, testing, builds, installation, releases, live patches, and
recovery. CPU, GPU, RAM, Temperature, and Wi-Fi tiers are defined in the
validated `config/status-colors.json` file. Day/night refresh behavior is in
`config/refresh-policy.json`. The safe Settings field order and labels are in
`config/settings-layout.json`. Every successful `npm run dist` copies the
manual, all three JSON files, and a Developer patch example into `dist` and the
current version's build folder.

The Python server exposes local CPU, GPU, RAM, and temperature data to the system-status readout, calls the fixed Composio MCP service directly for Google Calendar and Google Tasks (no LLM), and proxies the Anthropic API only for the greeting line. On macOS, RAM comes from `vm_stat` and `sysctl`, while Apple Silicon temperature comes directly from the read-only SMC sensor interface. Neither reading needs `psutil`, sudo, or a separate monitoring app. Unsupported sensors are shown as unavailable.

Calendar and Tasks refresh at the interval selected in Settings (15 minutes by
default), except from 00:00 through 05:59 local time when they refresh every 30
minutes on clock-aligned boundaries. Click either widget's "Updated … ago" text
to refresh it immediately without changing the automatic schedule.
For browser-only development, `.env.example` documents the two optional
credentials. Everything degrades gracefully when a key is missing.

## About

A personal info dashboard, always on, shown fullscreen on a small screen.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current release: **0.5.2** (App Core **0.5.2_D**)

- Prepared the final `0.5.2` Stable release with `Panel-0.5.2.dmg`, ZIP,
  block maps, and `latest-mac.yml` metadata.
- Added `VERSION.json` to the mounted DMG, App resources, and release folder so
  the App Core, artifact, Git tag, release, and public status remain auditable.
- Replaced the tabbed Settings UI with one compact screen for both encrypted
  connections, refresh time, and the per-device update channel.
- Added a strictly validated `settingsLayout` live-patch field that may only
  change the title, four labels, and the order of the four mandatory rows.
- Kept Test connections, Save, mask/reveal, fixed MCP URL, and encrypted secret
  storage immutable so a patch cannot weaken the Settings security controls.
- Retained per-device Stable/Developer channels, signed full-App updates,
  atomic patch activation and rollback, and credential-free artifacts.

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
