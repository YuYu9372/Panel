# Runtime Update

## Current status

The standalone Runtime toolchain is implemented on the `1.1.0` development
branch. It can prepare a file manifest, sign it with an offline Ed25519 key,
create a deterministic ZIP, verify the package, stage it in an inactive A/B
slot, activate it, confirm health, or roll it back.

Panel can check the fixed signed feed, show a Runtime update in the existing update
card, stream the ZIP into an owner-only temporary directory, verify its signed size
and SHA-256 digest, and ask Rust to stage it. Activation, the full-screen Updating
experience, Runtime process launching, health supervision, and automatic recovery
still need to be connected. Use a Full Version Update for production program-code
changes until that integration is complete.

## Purpose

Runtime Update will allow these files to update without a normal DMG installation:

- HTML and CSS
- Renderer JavaScript and Widgets
- Python services
- images, fonts, and feature assets
- compatible Electron main and preload code

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

## Complete workflow target

```text
Edit code
→ Test
→ Increase Runtime revision
→ Build signed Runtime package
→ Upload package
→ User clicks Update
→ Panel shows Updating progress
→ Panel switches Runtime slot
→ Health check or rollback
```

## Planned user experience

The user will click a Runtime Update button. Panel will show:

```text
Downloading
Verifying
Preparing
Restarting services
Checking health
Complete
```

The Rust foundation already maintains the active, previous, and pending slots. It
also remembers the highest accepted sequence and Runtime revision after rollback,
so a published identity cannot be reused. The future supervisor will call
`confirm` after a successful health check or `rollback` after failure.

The current update card implements the safe first half of this flow. A user may
download a Runtime, watch its progress, and reach `Ready to apply`. The Apply action
remains deliberately disabled until the Updating screen and health supervisor are
implemented.

## Important boundary

Runtime Update will not replace the Bootstrap, root signature verifier, embedded
public keys, recovery manager, or update process. Those components require a Full
Version Update.
