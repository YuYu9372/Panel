# Panel Operations Manual

This manual covers routine development, Wi-Fi tier changes, testing, packaging,
installation, Stable and Developer releases, restricted UI hot patches, and
recovery.

## 1. Important locations

| Purpose | Location |
| --- | --- |
| Source repository | `/Users/yu/Dev_code/Panel` |
| Current build output | `dist/0.5.2/Beta_B` |
| Installed App | `/Applications/Panel.app` |
| Encrypted per-user settings | `~/Library/Application Support/Panel/secure-settings/settings.json` |
| UI patch state | `~/Library/Application Support/Panel/ui-patches/state.json` |
| Private patch signing keys | `~/Library/Application Support/Panel Developer/update-signing` |
| Public update repository | `YuYu9372/Panel-Updates` |

API keys and tokens belong only in Panel Settings. Never add them to source,
DMG files, ZIP files, Git commits, release notes, screenshots, or patch files.

## 2. Start Panel during development

```bash
cd /Users/yu/Dev_code/Panel
npm install
npm start
```

The development App uses the source files directly. Quit it before testing an
installed build so that two copies do not compete for local port `8642`.

## 3. Wi-Fi latency tiers

The shared Wi-Fi thresholds are in `widgets/wifi-tiers.js`:

```js
const wifiThresholds = Object.freeze([20, 30, 41]);
```

They apply to both the top Wi-Fi indicator and the bottom history row:

| Latency | Tier |
| --- | --- |
| Less than 20 ms | green |
| 20 ms through less than 30 ms | yellow |
| 30 ms through less than 41 ms | red |
| 41 ms and above | purple |
| Missing or offline | gray or offline red |

After changing these numbers, update the Wi-Fi tests and run `npm test`. This is
App behavior, so it requires a full App build. The restricted UI hot-patch path
cannot change network logic.

### JSON lesson

This is valid JSON syntax:

```json
{
  "wifi": {
    "<20ms": "green",
    "<30ms": "yellow",
    "<40ms": "red",
    ">41ms": "purple"
  }
}
```

However, it is not a complete or unambiguous rule set. JSON treats `<20ms` as
ordinary text; JSON does not execute comparisons. If another program evaluates
every label literally, values under 20 also match `<30ms` and `<40ms`. Values
equal to 40 or 41 match nothing because `<40` excludes 40 and `>41` excludes
41.

An explicit JSON representation would be:

```json
{
  "wifi": {
    "rules": [
      { "minInclusiveMs": 0, "maxExclusiveMs": 20, "color": "green" },
      { "minInclusiveMs": 20, "maxExclusiveMs": 30, "color": "yellow" },
      { "minInclusiveMs": 30, "maxExclusiveMs": 41, "color": "red" },
      { "minInclusiveMs": 41, "maxExclusiveMs": null, "color": "purple" }
    ]
  }
}
```

`null` means that the last range has no upper limit. Panel currently uses the
short JavaScript threshold array because the evaluation order is defined in
one tested function.

## 4. Run checks before every build

```bash
cd /Users/yu/Dev_code/Panel
npm test
npm audit --audit-level=low
git diff --check
git status --short
```

Expected results:

- Every Node and Python test passes.
- `npm audit` reports zero known vulnerabilities.
- `git diff --check` prints nothing.
- Review every changed file before committing.

Do not stage `.env`, private PEM files, generated signed patches, or personal IDE
state.

## 5. Update the version

Before a new release, keep these locations consistent:

1. `package.json` version
2. `package.json` artifact name and output directory
3. `index.html` visible version
4. `electron/settings.html` visible version
5. `README.md`
6. `RELEASE_NOTES.md`
7. `plan.md`

Use semantic versions for the App bundle:

- Developer: `0.5.3-alpha.1`
- Stable: `0.5.3`

Never reuse a version that has already been published. Recovery from a bad
release requires a higher version.

## 6. Build DMG and automatic-update files

```bash
cd /Users/yu/Dev_code/Panel
npm run dist
```

The command builds:

- DMG for manual installation
- ZIP for macOS automatic updates
- DMG and ZIP block maps
- Channel metadata such as `alpha-mac.yml` or `latest-mac.yml`
- A copy of this operations manual in `dist` and the current output directory

Do not move only the DMG when publishing an automatic update. The ZIP, channel
metadata, and matching block maps belong to the same release.

## 7. Verify a build

Replace the paths when the version changes:

```bash
hdiutil verify dist/0.5.2/Beta_B/panel-0.5.2-B.dmg
unzip -tq dist/0.5.2/Beta_B/panel-0.5.2-B.zip
codesign --verify --deep --strict --verbose=2 dist/0.5.2/Beta_B/mac-arm64/Panel.app
shasum -a 256 dist/0.5.2/Beta_B/panel-0.5.2-B.dmg
shasum -a 256 dist/0.5.2/Beta_B/panel-0.5.2-B.zip
```

For a public release, the App must use a Developer ID Application certificate
and Apple notarization. An Apple Development signature is only for local or
developer testing.

## 8. Install a local build safely

Quit Panel first. Keep a recoverable backup of the installed App:

```bash
mv /Applications/Panel.app /Users/yu/.Trash/Panel-before-new-build.app
ditto dist/0.5.2/Beta_B/mac-arm64/Panel.app /Applications/Panel.app
codesign --verify --deep --strict /Applications/Panel.app
open /Applications/Panel.app
```

Choose a new backup name if that Trash path already exists. Replacing the App
does not replace the encrypted per-user API settings.

To roll back, quit Panel, move the current App aside, and restore the backup
from Trash. A rollback may not be compatible with settings created by a much
newer version, so test it before depending on it.

## 9. Stable and Developer channels

Each Mac chooses its own channel in **Settings → Updates**:

- Stable uses the `latest` update channel and Stable UI patch key.
- Developer uses the `alpha` update channel and Developer UI patch key.

Use Developer on the test Mac. Use Stable on the public Mac. Channel changes do
not permit version downgrades.

## 10. Publish a full App update

The source repository can remain private. Publish only release artifacts from
the public `YuYu9372/Panel-Updates` repository. Never put a GitHub private-access
token inside Panel.

Developer release checklist:

1. Use an `-alpha.N` version and `alpha` publish channel.
2. Run all checks and build the App.
3. Verify the signature, DMG, ZIP, hashes, and metadata.
4. Upload the DMG, ZIP, both block maps, and `alpha-mac.yml` to one prerelease.
5. Test download, restart, installation, settings, RAM, temperature, Calendar,
   Tasks, weather, clock, and Wi-Fi on the Developer Mac.
6. Do not promote the same prerelease as Stable. Build and sign a separate
   Stable version after validation.

Stable release checklist:

1. Use a normal semantic version without `-alpha`.
2. Use the `latest` channel.
3. Sign with Developer ID Application and notarize with Apple.
4. Upload the matching Stable artifacts and metadata to a public release.
5. Confirm the public Mac sees the update while the Developer Mac remains able
   to receive later alpha builds.

## 11. Publish a restricted UI hot patch

Use this path only for update-card text and allowlisted visual tokens. It cannot
change HTML, JavaScript behavior, API endpoints, preload code, Python, Wi-Fi
thresholds, or credentials.

1. Copy `patches/developer-ui-patch.example.json` to a new draft.
2. Increase `sequence`. Never reuse a sequence, including after rollback.
3. Give the patch a new `patchId`.
4. Keep `appVersionRange` narrow and set `lifetimeDays` from 1 to 30.
5. Sign it with the matching private key:

   ```bash
   PANEL_PATCH_SIGNING_KEY='/Users/yu/Library/Application Support/Panel Developer/update-signing/developer-private.pem' \
   PANEL_PATCH_KEY_ID='panel-developer-2026-01' \
   npm run sign:patch -- patches/developer-ui-patch.example.json dist/developer-ui-patch.json
   ```

6. Put the signed file at
   `Panel-Updates/patches/developer-ui-patch.json`.
7. Test it on the Developer Mac and confirm the patch is applied and health is
   confirmed.
8. Use `stable-ui-patch.json` and the offline Stable key only for an approved
   public patch.

Move the Stable private key to encrypted offline storage before public
distribution. The App and repository must contain only public keys.

## 12. Recovery and incident response

### Bad UI patch

- Remove the manifest from the public update repository.
- Panel automatically rolls back an unconfirmed or failed patch.
- Increase the sequence before publishing a corrected patch.

### Exposed UI patch private key

- Remove the affected manifest.
- Build a higher full App version with a replacement public key.
- Retire the exposed key ID.
- Never try to fix a key compromise using the compromised key.

### Bad full App release

- Stop publishing the bad release.
- Build, sign, notarize, and publish a higher corrected version.
- Do not overwrite and reuse the bad version number.

### Update check fails

Check these items:

1. `Panel-Updates` exists and is public.
2. The release is published rather than left as a draft.
3. The selected channel matches the release metadata.
4. DMG, ZIP, block maps, and metadata came from the same build.
5. The App is correctly signed and notarized.
6. The UI patch filename and channel-specific signature are correct.

## 13. Final release checklist

- [ ] Version strings agree everywhere.
- [ ] README and release notes are current.
- [ ] All tests pass.
- [ ] Dependency audit passes.
- [ ] DMG and ZIP verify.
- [ ] App signature verifies.
- [ ] No API key, token, `.env`, or private key is packaged.
- [ ] RAM and temperature return numeric values on the target Mac.
- [ ] Weather and clock graphics render.
- [ ] Calendar and Tasks load and manual refresh works.
- [ ] Wi-Fi boundary tests pass.
- [ ] Developer update is tested before Stable release.
- [ ] Public build is notarized.
- [ ] Git changes are reviewed and committed.
