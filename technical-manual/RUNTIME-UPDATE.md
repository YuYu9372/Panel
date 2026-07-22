# Runtime Update

## Current status

The standalone Rust foundation is implemented on the `1.1.0` development
branch. It can verify a signed Runtime ZIP, stage it in an inactive A/B slot,
activate it, confirm health, or roll it back.

Panel does not download or launch this Runtime yet. The Updating screen, package
builder, offline signing workflow, Electron launcher integration, process health
supervisor, and automatic recovery still need to be connected. Use a Full Version
Update for production program-code changes until that integration is complete.

## Purpose

Runtime Update will allow these files to update without a normal DMG installation:

- HTML and CSS
- Renderer JavaScript and Widgets
- Python services
- images, fonts, and feature assets
- compatible Electron main and preload code

## Foundation CLI

Build it:

```bash
cargo build --release --manifest-path bootstrap-native/Cargo.toml
```

Use a separate test root while developing:

```bash
BOOTSTRAP='bootstrap-native/target/release/panel-bootstrap'
ROOT='/tmp/panel-runtime-test'
PACKAGE='/path/to/panel-runtime-r1.zip'
PUBLIC_KEY='/path/to/developer-public.pem'

"$BOOTSTRAP" --root "$ROOT" verify "$PACKAGE" \
  --public-key "$PUBLIC_KEY" \
  --key-id panel-developer-2026-01 \
  --app-version 1.1.0 \
  --channel developer \
  --bootstrap-api 1 \
  --runtime-api 1

"$BOOTSTRAP" --root "$ROOT" stage "$PACKAGE" \
  --public-key "$PUBLIC_KEY" \
  --key-id panel-developer-2026-01 \
  --app-version 1.1.0 \
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
Panel integration must supply a public key embedded by a trusted Full Version
Update. It must never accept an arbitrary downloaded public key.

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

## Important boundary

Runtime Update will not replace the Bootstrap, root signature verifier, embedded
public keys, recovery manager, or update process. Those components require a Full
Version Update.
