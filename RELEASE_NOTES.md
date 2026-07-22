# Release Notes

## Panel 1.0.1

Panel 1.0.1 simplifies Settings and adds a safe RAW editing mode.

**Public version:** `1.0.1`

**Release build:** `1.0.1+1.104R`

**Manual installer:** `panel.dmg`

**DMG SHA-256:** `cb6a9333cd0a59c7a0c295cb2ff0cbf2fee4c9df5a1af87ad494f7ee5bb8c974`

### Settings

- Replaced decorative Settings surfaces with a flatter, quieter interface that
  keeps the same dashboard colors and typography.
- Added a **RAW** control that requires a double-click to enter or leave.
- RAW mode edits only `PANEL_REFRESH_MINUTES`, `PANEL_UPDATE_CHANNEL`,
  `ANTHROPIC_API_KEY`, `COMPOSIO_MCP_URL`, and `COMPOSIO_MCP_TOKEN` as
  `.env`-style `KEY=value` text.
- Saved API credentials remain encrypted and are never printed into RAW mode.
  Leaving a secret blank preserves it; entering a value replaces it.
- Unknown or duplicate fields, invalid refresh values, invalid update channels,
  and changes to Panel's fixed Composio MCP URL are rejected.

### Security and compatibility

- RAW mode does not expose the Electron process environment, local `.env`
  files, or unrelated system variables.
- Existing mask/reveal controls, connection tests, secure storage, signed full
  updates, and restricted Ed25519 Live Patches remain available.
- Live Patch compatibility is restricted to `>=1.0.1 <1.0.2`.
- 55 Node security and behavior tests and 9 Python tests pass.

The DMG, ZIP, App signature structure, update metadata, packaged RAW resources,
and version metadata were verified before release. This community build is
Apple Development-signed but not notarized; Gatekeeper may require the manual
first-launch override documented below.

## Panel 1.0.0

Panel 1.0.0 is the first public baseline release. It contains the complete
current application and does not require any previous Panel version.

**Public version:** `1.0.0`

**Release build:** `1.0.0+4.103R`

**Manual installer:** `panel.dmg`

**DMG SHA-256:** `7b2f4c47f1acfe22d64e3ffbc3c53207e8291b447283cf95a14949c53e2c15d4`

**Automatic-update payload:** `panel.zip`

### Dashboard

- Full-screen 2 × 2 layout with Clock, Weather, Calendar, and Tasks.
- Analog and digital clock, current date, time-aware greeting, and automatic
  Light/Dark theme switching.
- Taipei weather, condition icon, temperature, and color-tiered UV index through
  Open-Meteo without an API key.
- Google Calendar timeline and Google Tasks folders with task-completion syncing
  through Panel's fixed Composio MCP service.
- Calendar and Tasks refresh at the user-selected interval during the day and
  every 30 minutes from 00:00 through 05:59 local time.
- Calendar and Tasks “Updated … ago” controls support immediate manual refresh
  without moving the next automatic refresh boundary.

### Device and network status

- Live CPU, GPU, RAM, Apple Silicon temperature, Wi-Fi latency, and device
  uptime readings.
- Twelve clock-aligned history windows with validated green, yellow, red,
  purple, offline, and unavailable states.
- Network connectivity indicator and an offline clock screen that preserves
  local system information while the internet is unavailable.

### Settings and credentials

- Minimal Settings screen opened from the gear beside the Wi-Fi indicator.
- Configurable refresh time, Anthropic API key, Composio MCP token, and
  per-device Stable or Developer update channel.
- Mask/reveal controls, connection testing, and encrypted credential storage
  through macOS secure storage.
- Fixed Composio MCP URL and credential-free release artifacts. Every user
  supplies their own optional API credentials after installation.
- Graceful local fallbacks when Anthropic or Composio credentials are absent.

### Updates and Live Patches

- Full-App update card with release details, download progress, and
  restart-to-install behavior.
- Full updates and Live Patch manifests are fetched from the public
  `YuYu9372/Panel` repository without embedding a GitHub token.
- Restricted Ed25519 Live Patches can update validated status colors, refresh
  policy, Settings labels/order, update-card text, and allowlisted design
  tokens without executing downloaded code.
- Patch signature, channel, sequence, expiration, size, compatibility, atomic
  activation, health confirmation, rollback, and replay protection.

### Version and Build information

- Public version `1.0.0` appears in the lower-left corner.
- Triple-clicking the public version opens the complete `VERSION.json` metadata;
  the dialog closes with ×, Escape, or a click outside.
- Base Build `1.0.0+4.103R` follows the new version scheme.
- A verified Patch number is appended at runtime, for example
  `1.0.0+4.103Rp2`, without modifying the signed App bundle.
- `VERSION.json` is available in the mounted DMG, packaged App resources, and
  release directory.

### Security and verification

- The DMG contains no Anthropic API key, Composio token, `.env`, private Patch
  signing key, or GitHub access token.
- Credentials are stored outside the App bundle with owner-only permissions and
  macOS encryption.
- Dashboard IPC, local HTTP origin checks, Content Security Policy, Patch field
  allowlists, HTTPS, and Ed25519 verification protect security-sensitive paths.
- 51 Node security and behavior tests and 9 Python tests pass.
- The dependency audit reports zero known vulnerabilities.
- DMG, ZIP, update metadata, block maps, packaged version metadata, and App
  signature structure were verified before release.

### macOS first launch

This build is not Apple-notarized. Gatekeeper may block the first launch. Copy
Panel to Applications, try opening it once, then use **System Settings → Privacy
& Security → Open Anyway** and confirm. Managed Macs may not allow this
override. Verify the published SHA-256 checksum before opening the App.
