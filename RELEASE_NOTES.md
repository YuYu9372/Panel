# Release Notes

## 0.5.2_C

Developer bootstrap for signed live configuration and revised status behavior.

**Manual installer:** `panel-0.5.2-C.dmg`

**Automatic-update payload:** `panel-0.5.2-C.zip`

### Changed

- Updated the semantic App version to `0.5.2-alpha.3`, displayed as
  `0.5.2_C` throughout Panel.
- CPU is green below 80%, yellow from 80 to below 90%, red from 90 to below
  94%, and purple from 94% upward.
- GPU is green below 80%, yellow from 80 to below 90%, red from 90 to below
  96%, and purple from 96% upward.
- RAM is green below 70%, yellow from 70 to below 80%, red from 80 to below
  90%, and purple from 90% upward.
- Temperature is green below 70°C, yellow from 70 to below 80°C, red from 80
  to below 95°C, and purple from 95°C upward.
- Wi-Fi is green below 25 ms, yellow from 25 to below 35 ms, red from 35 to
  below 45 ms, and purple from 45 ms upward.
- Calendar and Tasks use the Settings refresh interval during the day and a
  clock-aligned 30-minute interval from 00:00 until 06:00 local time.
- Clicking either "Updated … ago" label still forces an immediate refresh and
  does not move the next automatic boundary.

### Added

- Signed Ed25519 live patches may now carry the complete validated status-color
  JSON and refresh policy without allowing arbitrary HTML, JavaScript, Python,
  API endpoints, credentials, or preload changes.
- Live configuration activation updates the dashboard immediately, confirms
  health, writes atomically, blocks sequence replay, and rolls back on failure.
- Added `patches/developer-live-patch.example.json` containing the requested
  thresholds and night schedule for the later Developer patch trial.

### Publishing

- Produces the Developer-channel DMG, ZIP, block maps, and `alpha-mac.yml`.
- The public artifact-only `YuYu9372/Panel-Updates` repository must be created
  before the first automatic-update release can be published.
- This build uses an Apple Development signature for testing. Public macOS
  distribution still requires Developer ID Application signing and notarization.

### Verified

- 41 Node security and behavior tests plus 9 Python tests pass.
- The JSON, built-in fallback, boundary tests, and packaged App use identical
  color and refresh rules.
- The DMG, ZIP, App signature, update metadata, and absence of packaged API
  credentials are verified before release.

---

## 0.5.2_B

Signed Stable/Developer updates and restricted UI hot patches.

**Manual installer:** `panel-0.5.2-B.dmg`

**Automatic-update payload:** `panel-0.5.2-B.zip`

### Added

- An update icon to the left of Wi-Fi that only appears after a newer build is
  detected. It opens an anchored card with installed and available versions,
  plain-text release notes, progress, and restart-to-install.
- An Updates tab in Settings with per-device Stable and Developer channels.
- Full-App updates through `electron-updater`. macOS builds now include DMG,
  ZIP, channel metadata, and block maps.
- Independently signed UI hot patches for the update card. Ed25519 verification
  covers the channel, monotonic sequence, issue and expiry times, compatible App
  range, text, and allowlisted Light/Dark design tokens.
- Atomic patch activation, an immutable-renderer health confirmation, crash
  detection, rollback to the previous patch, and replay prevention.
- Separate Stable and Developer signing keys. Only public keys are packaged.

### Security

- UI patches cannot contain HTML, JavaScript, API endpoints, preload code, or
  Python. Behavior changes require a fully signed App update.
- Update release notes are rendered as plain text and are length-limited.
- The client contains no GitHub PAT and does not expose update URLs, local paths,
  or credentials to the dashboard.
- Checking settings status no longer decrypts credentials. Decryption happens
  only when starting the managed server or testing connections.
- Patch manifests are limited to 128 KiB while streaming, require HTTPS in
  packaged builds, expire within 31 days, and cannot cross channels.

### Changed

- The top Wi-Fi indicator and bottom Wi-Fi history now share one tested tier
  function: green below 20 ms, yellow from 20 to below 30 ms, red from 30 to
  below 41 ms, and purple from 41 ms upward.
- CPU, GPU, RAM, Temperature, Wi-Fi, offline, and unavailable colors now come
  from `config/status-colors.json`. Panel rejects gaps, overlaps, missing
  metrics, unsupported fields, and unsupported colors before using the file.
- Added an English operations manual covering builds, installation, channel
  releases, UI hot patches, credential safety, verification, and recovery. A
  current copy and the status color JSON are placed in `dist` after every
  successful build.

### Verified

- 32 Node security and behavior tests plus 9 Python tests pass.
- A real Developer patch was signed outside the repository, fetched from an
  isolated localhost test feed, verified, atomically applied, confirmed healthy,
  and rendered in Electron.
- Forged signatures, expired patches, cross-channel patches, arbitrary script
  fields, sequence replay, oversized manifests, and failed health checks are
  rejected or rolled back in automated tests.
- The production artifact feed remains intentionally inactive until the public
  `YuYu9372/Panel-Updates` repository and Developer ID/notarization are ready.

---

## 0.5.2_A

Secure per-device connections and a dashboard-matched Settings screen.

**Download:** `panel-0.5.2-A.dmg` (contains no API credentials)

### Added

- A Settings gear beside the Wi-Fi indicator. Settings only opens when the gear
  is clicked and uses the same visual language as the dashboard.
- A Connections tab with a configurable Calendar and Tasks refresh time,
  Anthropic API key, Composio MCP token, mask/reveal controls, connection tests,
  and Save changes.
- Encrypted credential storage through Electron `safeStorage`. Secrets live in
  the current macOS user's application-data directory instead of the app bundle,
  are written with owner-only permissions, and are never returned to the
  dashboard renderer.
- A single credential-free installer for both personal and public devices. Each
  device stores its own settings after installation.

### Changed

- The Composio MCP URL is fixed to Panel's supported endpoint and no longer
  appears as an editable setting.
- Calendar and Tasks use the selected refresh interval from 1 to 1440 minutes;
  the default remains 15 minutes and their Updated text still refreshes
  immediately when clicked.
- Electron was updated to 43.1.1 and electron-builder to 26.15.3.
- Weather requests now pass through Panel's local server, allowing the renderer
  to keep a same-origin network policy.

### Fixed

- Removed the visible frame around the Settings gear.
- Restored the weather condition icon after the strict content policy blocked
  its external request.
- Restored analog clock hand transforms after the strict content policy blocked
  dynamic style attributes.

### Verified

- 9 Node tests and 9 Python tests pass.
- The packaged dependency audit reports 0 known vulnerabilities.
- The dashboard was exercised in Electron: Settings opens only from the gear,
  credentials remain masked, Calendar and Tasks receive the configured interval,
  and weather and clock graphics render correctly.

---

## 0.5.1-C

Native RAM and temperature readings for Apple Silicon Macs.

**Private download:** `panel-0.5.1-C-dev.dmg` (includes the configured APIs)

**Public download:** `panel-0.5.1-C-public.dmg` (contains no API credentials)

### Changed

- Calendar and Tasks now refresh automatically every 15 minutes.
- The "Updated … ago" text in Calendar and Tasks is now a button. Clicking it
  bypasses the server cache and fetches fresh data immediately.

### Fixed

- **RAM no longer depends on the selected Python installation.** Panel now reads
  macOS virtual-memory counters through `vm_stat` and `sysctl`, so the RAM row
  works even when the Python selected by the packaged app has no `psutil`.
- **Temperature now works on Apple Silicon.** Panel reads the available CPU
  temperature sensors directly from Apple's read-only SMC interface and shows
  their average in Celsius. It does not require sudo or a
  separate monitoring app.
- **Version metadata is consistent.** The dashboard shows `0.5.1_Beta_C`, the
  installers use the requested 0.5.1-C names, and the app bundle uses the
  semantic version 0.5.1.
- **The installed signature remains valid after launch.** The Electron launcher
  prevents Python from writing bytecode cache files into the signed app bundle.

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
