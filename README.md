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
npm run dist            # dist/1.0.1/1.0.1+1.1D: DMG + update files
```

Open the `.dmg`, drag **Panel** to Applications, and launch it — it opens full-screen (kiosk) and starts the Python server for you. Needs the system `python3` (the app tells you to install it if it is missing). During development, `npm start` runs the same window without packaging.

The installer never contains API credentials. Click the gear beside the Wi-Fi
indicator to open the minimal **Settings** screen, then enter the Anthropic API
key and Composio MCP token for that Mac. Credentials are encrypted with macOS
`safeStorage`, stay outside the signed app bundle, and are never returned to the
dashboard renderer. The Composio MCP URL is fixed by Panel and is not a user
setting.

Settings uses a flat, compact form. Double-click **RAW** to edit the same
allowlisted settings as `.env`-style `KEY=value` text, and double-click
**FORM** to return. RAW mode never displays saved secret values: blank secret
fields preserve the encrypted values already on that Mac, while a newly entered
value replaces the corresponding secret. It does not expose `process.env` or
any unrelated system environment variables.

The **Update channel** row selects Stable or Developer releases on each Mac.
When a verified update exists, a download icon appears to the left of Wi-Fi and
opens the update details card. See [docs/UPDATES.md](docs/UPDATES.md) for the
signed full-update and declarative live-patch workflow.

Full updates and Live Patch manifests are read from the public
`YuYu9372/Panel` repository. The repository and every release artifact remain
credential-free; API credentials are entered and encrypted separately on each
Mac.

The English [operations manual](docs/OPERATIONS.md) covers routine development,
status color changes, testing, builds, installation, releases, live patches, and
recovery. CPU, GPU, RAM, Temperature, and Wi-Fi tiers are defined in the
validated `config/status-colors.json` file. Day/night refresh behavior is in
`config/refresh-policy.json`. The safe Settings field order and labels are in
`config/settings-layout.json`. Every successful `npm run dist` copies the
manual, all three JSON files, and a Developer patch example into `dist` and the
current version's build folder.

The [three-tier update architecture](docs/UPDATE_ARCHITECTURE.md) records the
agreed Full Version Update, planned Runtime Update, and Standard Live Patch
boundaries and the operator workflow for each tier.

The Python server exposes local CPU, GPU, RAM, and temperature data to the system-status readout, calls the fixed Composio MCP service directly for Google Calendar and Google Tasks (no LLM), and proxies the Anthropic API only for the greeting line. On macOS, RAM comes from `vm_stat` and `sysctl`, while Apple Silicon temperature comes directly from the read-only SMC sensor interface. Neither reading needs `psutil`, sudo, or a separate monitoring app. Unsupported sensors are shown as unavailable.

Calendar and Tasks refresh at the interval selected in Settings (15 minutes by
default), except from 00:00 through 05:59 local time when they refresh every 30
minutes on clock-aligned boundaries. Click either widget's "Updated … ago" text
to refresh it immediately without changing the automatic schedule.
For browser-only development, `.env.example` documents the two optional
credentials. Everything degrades gracefully when a key is missing.

## About

Panel is a full-screen personal dashboard for Apple Silicon Macs. Version
`1.0.1` adds a simpler Settings experience and a security-restricted RAW editor
to the complete public baseline; no earlier release is required.

## Features

- Full-screen 2 × 2 dashboard with Clock, Weather, Calendar, and Tasks.
- Analog and digital clock, date, time-aware greeting, and automatic Light/Dark
  theme switching.
- Taipei weather, condition icon, temperature, and color-tiered UV index using
  Open-Meteo without an API key.
- Google Calendar timeline and Google Tasks folders with completion syncing
  through Panel's fixed Composio MCP service.
- Live CPU, GPU, RAM, temperature, Wi-Fi latency, device uptime, and twelve
  clock-aligned history windows.
- Network indicator and an offline clock screen that keeps local device status
  available when the internet connection fails.
- Configurable Calendar and Tasks refresh time, a 30-minute night schedule from
  00:00 through 05:59, and click-to-refresh controls.
- Flat, minimal Settings screen with masked Anthropic and Composio credentials,
  reveal controls, connection testing, encrypted macOS storage, per-device
  update channel selection, and a double-click RAW editor.
- Credential-free DMG: every Mac owner supplies and encrypts their own optional
  API credentials after installation.
- Signed full-App update support and restricted Ed25519 Live Patches for
  validated UI text, design tokens, status colors, refresh policy, and Settings
  layout.
- Public version `1.0.1` in the lower-left corner. Triple-clicking it reveals
  the detailed Build metadata and active Patch number.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current developer-test version: **1.0.1**

- Developer build: `1.0.1+1.1D`.
- Electron update version: `1.0.1-alpha.1`, allowing the later stable `1.0.1`
  to supersede this developer build.
- Test DMG: `dist/1.0.1/1.0.1+1.1D/panel.dmg`.
- The lower-left corner displays only `1.0.1`. Triple-click it to inspect the
  complete runtime `VERSION.json` metadata.
- A signed Live Patch with `patchNumber: 2` changes the runtime build display
  to `1.0.1+1.1Dp2` without modifying the signed App bundle.
- Simplified Settings into a flat form and added a double-click RAW/FORM switch
  for its five allowlisted `.env`-style fields.
- Kept saved secret values out of RAW output; blank secrets preserve encrypted
  values and entered secrets replace them.
- Added a strictly validated `settingsLayout` live-patch field that may only
  change the title, four labels, and the order of the four mandatory rows.
- Kept Test connections, Save, mask/reveal, fixed MCP URL, and encrypted secret
  storage immutable so a patch cannot weaken the Settings security controls.
- Retained per-device Stable/Developer channels, signed full-App updates,
  atomic patch activation and rollback, and credential-free artifacts.

The complete naming rules are in [docs/VERSIONING.md](docs/VERSIONING.md).
Development history is in [plan.md](plan.md).

## macOS first launch

This community DMG is not Apple-notarized. Gatekeeper may block the first
launch. After copying Panel to Applications, try opening it once, then use
**System Settings → Privacy & Security → Open Anyway** and confirm. Managed Macs
may prohibit this override. The published SHA-256 checksum should be checked
before allowing the App.

## Coworkers
- YuYu9372
- Claude
