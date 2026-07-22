# Standard Live Patch

## Use it for

Use a Standard Live Patch for supported JSON configuration and appearance changes:

- status colors and thresholds
- refresh policy
- Settings title, labels, and field order
- supported update-card appearance
- future Task, Calendar, and dashboard appearance fields
- preinstalled feature flags and validated rules

Do not use it for arbitrary HTML, CSS, JavaScript, Python, preload, Electron main
code, credentials, or security code.

## Simple workflow

```text
Edit Patch draft
→ Increase Patch number
→ Increase sequence
→ Test
→ Sign
→ Commit and push main
→ Panel applies it automatically
```

## Current next numbers

The current published Patch is `p3` with sequence `5`.

The next Patch should use:

```json
{
  "patchNumber": 4,
  "sequence": 6
}
```

Never reuse a sequence.

## Step 1: Edit the draft

Edit:

```text
patches/developer-live-patch.example.json
```

Give it a unique `patchId`, increase `patchNumber` and `sequence`, and change only
supported fields.

## Step 2: Test

```bash
npm test
```

Stop if a test fails.

## Step 3: Keep a local copy of the previous signed Patch

Replace `p3` with the actual previous Patch number when needed.

```bash
mv patches/developer-live-patch.json /tmp/developer-live-patch-p3.json
```

## Step 4: Sign

```bash
PANEL_PATCH_SIGNING_KEY='/Users/yu/Library/Application Support/Panel Developer/update-signing/developer-private.pem' \
PANEL_PATCH_KEY_ID='panel-developer-2026-01' \
npm run sign:patch -- \
patches/developer-live-patch.example.json \
patches/developer-live-patch.json
```

Never edit `patches/developer-live-patch.json` after signing it.

## Step 5: Commit and publish

```bash
git add \
  patches/developer-live-patch.example.json \
  patches/developer-live-patch.json \
  tests-js/live-patch-draft.test.js

gitleaks git --staged
git commit -m "Publish developer live patch p4"
git push origin main
```

A Standard Live Patch does not need a Git tag, GitHub Release, DMG, or ZIP.

## Step 6: Confirm

Set Panel to the Developer update channel and click Check for updates, or wait for
the automatic check. GitHub Raw cache may take several minutes to update.

After Patch `p4` is accepted, the development Build displays:

```text
1.0.1+1.1Dp4
```

The local state is stored at:

```text
~/Library/Application Support/Panel/ui-patches/state.json
```
