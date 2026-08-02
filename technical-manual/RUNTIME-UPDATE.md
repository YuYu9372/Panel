# Runtime Update

## Current status

The complete Developer Runtime flow is implemented on the `1.1.0` development
branch. It prepares and signs a deterministic ZIP, verifies it, stages it in an
inactive A/B slot, shows an Updating screen, launches the selected Runtime, checks
the local API and Renderer, confirms a healthy change, and rolls back a failed or
interrupted activation.

The Developer channel has its embedded public key. Stable Runtime publishing
remains disabled until a separate Stable key is created and shipped in a Full
Version Update.

## Purpose

Runtime Update will allow these files to update without a normal DMG installation:

- HTML and CSS
- Renderer JavaScript and Widgets
- Python services
- images, fonts, and feature assets

Electron main, preload, the Rust Bootstrap, and trust keys remain part of the
Full Version Update boundary.

## First Runtime package

Developer Runtime r1 is the first feature package for the `1.1.0` Baseline. It
adds a full-screen server-style monitor that opens when a user clicks CPU, GPU,
RAM, Temperature, or Wi-Fi in the bottom dock. The detailed view retains
twenty-four half-hour windows, covering twelve hours, while the compact dock
continues to show twelve windows.

## Create a Developer Runtime package

Start with `runtime/developer-runtime.example.json`. Increase both
`runtimeRevision` and `sequence` for every new package. Never reuse either value,
including after rollback.

Create a separate Runtime signing key outside the repository once:

```bash
KEY_DIR="$HOME/Library/Application Support/Panel Developer/runtime-signing"
mkdir -p "$KEY_DIR"
npm run generate:runtime-key -- \
  "$KEY_DIR/developer-private.pem" \
  runtime-trust/developer-public.pem
```

Prepare the unsigned manifest:

```bash
npm run prepare:runtime -- \
  runtime/developer-runtime.example.json \
  runtime-output/r1/manifest.draft.json
```

Sign it. The private key is read from its external location and is never copied
into the output:

```bash
PANEL_RUNTIME_SIGNING_KEY="$HOME/Library/Application Support/Panel Developer/runtime-signing/developer-private.pem" \
PANEL_RUNTIME_KEY_ID='panel-runtime-developer-2026-01' \
npm run sign:runtime -- \
  runtime-output/r1/manifest.draft.json \
  runtime-output/r1/manifest.signed.json
```

Create the deterministic ZIP:

```bash
npm run pack:runtime -- \
  runtime/developer-runtime.example.json \
  runtime-output/r1/manifest.signed.json \
  runtime-output/r1/panel-runtime-r1.zip
```

After creating the matching GitHub release URL, sign the small update feed. The
feed binds that URL to the exact ZIP digest, size, revision, sequence, channel,
Baseline, and API versions:

```bash
PANEL_RUNTIME_SIGNING_KEY="$HOME/Library/Application Support/Panel Developer/runtime-signing/developer-private.pem" \
PANEL_RUNTIME_KEY_ID='panel-runtime-developer-2026-01' \
npm run sign:runtime-feed -- \
  runtime-output/r1/manifest.signed.json \
  runtime-output/r1/panel-runtime-r1.zip \
  runtime/developer-feed.example.json \
  runtime-output/r1/developer-feed.json
```

Upload `panel-runtime-r1.zip` to the exact GitHub release URL signed in the feed.
After verifying the uploaded package, publish the signed feed as
`runtime/developer-feed.json`. Never modify an existing Runtime release or reuse
its revision and sequence.

Each command refuses to overwrite an existing output. Use a new output directory
for the next revision. `runtime-output` is ignored by Git.

## What the user sees

1. Panel finds the signed feed and displays the update icon.
2. The user opens the update card and clicks **Download Runtime update**.
3. Panel downloads, verifies, and stages the ZIP without changing the active code.
4. The button changes to **Apply Runtime update**.
5. Panel shows the full-screen Updating view and switches to the inactive A/B slot.
6. Panel starts that slot's Python service, verifies `/api/runtime-health`, loads
   its HTML, checks the required dashboard elements, and waits for the initialized
   Renderer to report ready through restricted IPC.
7. Rust confirms the new slot only after every health check passes.
8. A failure restores and relaunches the previous slot automatically.

If Panel exits after activation but before confirmation, the next launch detects
the unconfirmed slot and rolls it back before starting the dashboard.

## Verify and exercise the Rust foundation

Build it:

```bash
cargo build --release --manifest-path bootstrap-native/Cargo.toml
```

Use a separate test root while developing:

```bash
BOOTSTRAP='bootstrap-native/target/release/panel-bootstrap'
ROOT='/tmp/panel-runtime-test'
PACKAGE='runtime-output/r1/panel-runtime-r1.zip'
PUBLIC_KEY='runtime-trust/developer-public.pem'

"$BOOTSTRAP" --root "$ROOT" verify "$PACKAGE" \
  --public-key "$PUBLIC_KEY" \
  --key-id panel-runtime-developer-2026-01 \
  --app-version 1.1.0-alpha.1 \
  --channel developer \
  --bootstrap-api 1 \
  --runtime-api 1

"$BOOTSTRAP" --root "$ROOT" stage "$PACKAGE" \
  --public-key "$PUBLIC_KEY" \
  --key-id panel-runtime-developer-2026-01 \
  --app-version 1.1.0-alpha.1 \
  --channel developer \
  --bootstrap-api 1 \
  --runtime-api 1

"$BOOTSTRAP" --root "$ROOT" activate
"$BOOTSTRAP" --root "$ROOT" confirm
"$BOOTSTRAP" --root "$ROOT" status
```

Use `rollback` instead of `confirm` when the activated Runtime fails its health
check:

```bash
"$BOOTSTRAP" --root "$ROOT" rollback
```

The public key is a command argument only while this component is standalone.
Panel integration must supply this public key through a trusted Full Version
Update. It must never accept an arbitrary downloaded public key.

## Package safety rules

- The config contains an explicit source-to-target allowlist.
- `.env`, npm/Python credential files, private-key formats, symlinks, empty files,
  traversal paths, duplicate targets, and undeclared files are rejected.
- The packer recalculates every size and SHA-256 digest after signing.
- ZIP entries have a fixed timestamp, permissions, and sorted order.
- The signer requires owner-only private-key permissions and performs a signature
  self-check before writing output.
- The Rust verifier independently checks the signature and every packaged byte.
- Electron invokes the Rust Bootstrap with an argument array, a credential-free
  environment, a fixed channel key ID, and fixed API versions. Shell execution is
  disabled.
- The separately signed feed restricts package URLs to this repository's GitHub
  Releases and binds the download to its exact size and SHA-256 digest.

## Complete workflow

```text
Edit code
→ Test
→ Increase Runtime revision
→ Build signed Runtime package
→ Upload package
→ User downloads and clicks Apply
→ Panel shows Updating progress
→ Panel switches Runtime slot
→ API and Renderer health checks
→ Confirm or automatic rollback
```

## Updating states

The user will click a Runtime Update button. Panel will show:

```text
Downloading
Verifying
Preparing
Activating
Stopping services
Starting services
Checking services
Loading interface
Confirming
Complete
```

Rust maintains the active, previous, and pending slots. It remembers the highest
accepted sequence and Runtime revision after rollback, so a published identity
cannot be reused. Stable and Developer channel state use separate directories.

## Important boundary

Runtime Update does not replace Electron main or preload, the Rust Bootstrap, root
signature verifier, embedded public keys, recovery manager, or update process.
Those components require a Full Version Update.
