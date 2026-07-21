# Panel Operations Manual

This manual covers routine development, status color changes, testing, packaging,
installation, Stable and Developer releases, signed live patches, and
recovery.

## 1. Important locations

| Purpose | Location |
| --- | --- |
| Source repository | `/Users/yu/Dev_code/Panel` |
| Current build output | `dist/0.5.2/Beta_D` |
| Editable status color JSON | `config/status-colors.json` |
| Editable refresh policy | `config/refresh-policy.json` |
| Editable Settings layout | `config/settings-layout.json` |
| Developer live-patch example | `patches/developer-live-patch.example.json` |
| Installed App | `/Applications/Panel.app` |
| Encrypted per-user settings | `~/Library/Application Support/Panel/secure-settings/settings.json` |
| Live-patch state | `~/Library/Application Support/Panel/ui-patches/state.json` |
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

## 3. Status color JSON

Panel reads `config/status-colors.json` before starting the widgets. The file
controls CPU, GPU, RAM, Temperature, and Wi-Fi colors:

| Metric | Green | Yellow | Red | Purple |
| --- | --- | --- | --- | --- |
| CPU | `< 80%` | `80–<90%` | `90–<94%` | `≥ 94%` |
| GPU | `< 80%` | `80–<90%` | `90–<96%` | `≥ 96%` |
| RAM | `< 70%` | `70–<80%` | `80–<90%` | `≥ 90%` |
| Temperature | `< 70°C` | `70–<80°C` | `80–<95°C` | `≥ 95°C` |
| Wi-Fi | `< 25 ms` | `25–<35 ms` | `35–<45 ms` | `≥ 45 ms` |

The same Wi-Fi rules apply to the top indicator and the bottom history row.
Missing readings use the `unavailable` color. Offline Wi-Fi uses the `offline`
color and slash setting.

Edit only the source JSON. Do not edit a JSON file inside
`/Applications/Panel.app`, because changing an installed bundle invalidates its
signature. Run `npm test` after an edit. C and later builds can also receive
this complete validated JSON through a correctly signed live patch.

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

Panel's actual JSON representation uses explicit ranges:

```json
{
  "schemaVersion": 1,
  "metrics": {
    "wifi": {
      "unit": "ms",
      "rules": [
        { "minInclusive": 0, "maxExclusive": 25, "color": "green" },
        { "minInclusive": 25, "maxExclusive": 35, "color": "yellow" },
        { "minInclusive": 35, "maxExclusive": 45, "color": "red" },
        { "minInclusive": 45, "maxExclusive": null, "color": "purple" }
      ]
    }
  }
}
```

`minInclusive` includes the lower number. `maxExclusive` excludes the upper
number. `null` means that the final range has no upper limit. The validator
requires ordered, continuous ranges and falls back to safe built-in values if
the file is missing or invalid.

## 4. Calendar and Tasks refresh policy

`config/refresh-policy.json` keeps manual refresh enabled, uses the Settings
interval during the day, and changes Calendar and Tasks to a clock-aligned
30-minute interval from 00:00 until 06:00 in the Mac's local timezone.

Automatic refreshes occur at 00:00, 00:30, and every half hour through 05:30.
At 06:00 Panel returns to the Settings interval. Clicking the "Updated … ago"
label forces an immediate refresh but does not move the next automatic
boundary. The complete policy may be changed later by a signed live patch.

### Settings layout JSON

`config/settings-layout.json` controls only the title, labels, and order of the
four existing Settings rows. Every supported row must appear exactly once:

```json
{
  "schemaVersion": 1,
  "title": "Settings",
  "fieldOrder": [
    "anthropicApiKey",
    "composioMcpToken",
    "refreshMinutes",
    "updateChannel"
  ],
  "labels": {
    "anthropicApiKey": "Anthropic API Key",
    "composioMcpToken": "Composio MCP Token",
    "refreshMinutes": "Refresh time",
    "updateChannel": "Update channel"
  }
}
```

This file is a layout definition, not a settings-value file. Never put an API
key or token in it. D and later builds can receive it through a correctly
signed live patch. Mask/reveal, Test connections, Save, update verification,
and the fixed MCP URL are immutable and stay outside the patch format.

## 5. Run checks before every build

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

## 6. Update the version

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

## 7. Build DMG and automatic-update files

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
- A copy of `status-colors.json` in `dist` and the current output directory
- A copy of `refresh-policy.json` in `dist` and the current output directory
- A copy of `settings-layout.json` in `dist` and the current output directory
- A copy of `developer-live-patch.example.json` for the later signing exercise

Do not move only the DMG when publishing an automatic update. The ZIP, channel
metadata, and matching block maps belong to the same release.

## 8. Verify a build

Replace the paths when the version changes:

```bash
hdiutil verify dist/0.5.2/Beta_D/panel-0.5.2-D.dmg
unzip -tq dist/0.5.2/Beta_D/panel-0.5.2-D.zip
codesign --verify --deep --strict --verbose=2 dist/0.5.2/Beta_D/mac-arm64/Panel.app
shasum -a 256 dist/0.5.2/Beta_D/panel-0.5.2-D.dmg
shasum -a 256 dist/0.5.2/Beta_D/panel-0.5.2-D.zip
```

For a public release, the App must use a Developer ID Application certificate
and Apple notarization. An Apple Development signature is only for local or
developer testing.

## 9. Install a local build safely

Quit Panel first. Keep a recoverable backup of the installed App:

```bash
mv /Applications/Panel.app /Users/yu/.Trash/Panel-before-new-build.app
ditto dist/0.5.2/Beta_D/mac-arm64/Panel.app /Applications/Panel.app
codesign --verify --deep --strict /Applications/Panel.app
open /Applications/Panel.app
```

Choose a new backup name if that Trash path already exists. Replacing the App
does not replace the encrypted per-user API settings.

To roll back, quit Panel, move the current App aside, and restore the backup
from Trash. A rollback may not be compatible with settings created by a much
newer version, so test it before depending on it.

## 10. Stable and Developer channels

Each Mac chooses its own channel using the **Update channel** row in Settings:

- Stable uses the `latest` update channel and Stable live-patch key.
- Developer uses the `alpha` update channel and Developer live-patch key.

Use Developer on the test Mac. Use Stable on the public Mac. Channel changes do
not permit version downgrades.

## 11. Publish a full App update

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

## 12. Publish a signed live patch

Use this path for the complete validated status-color JSON, the validated
Calendar and Tasks refresh policy, the validated Settings layout, update-card
text, and allowlisted visual tokens. It cannot contain HTML, arbitrary
JavaScript, API endpoints, preload code, Python, credentials, field values, or
a setting that disables manual refresh.

1. Install D before publishing `settingsLayout`. C accepts status and refresh
   configuration but rejects Settings layout by design.
2. Copy `patches/developer-live-patch.example.json` to a new draft.
3. Increase `sequence`. Never reuse a sequence, including after rollback.
4. Give the patch a new `patchId`.
5. Keep `appVersionRange` narrow and set `lifetimeDays` from 1 to 30.
6. Sign it with the matching private key:

   ```bash
   PANEL_PATCH_SIGNING_KEY='/Users/yu/Library/Application Support/Panel Developer/update-signing/developer-private.pem' \
   PANEL_PATCH_KEY_ID='panel-developer-2026-01' \
   npm run sign:patch -- patches/developer-live-patch.example.json dist/developer-live-patch.json
   ```

7. Put only the signed output at
   `Panel-Updates/patches/developer-live-patch.json`.
8. Test it on the Developer Mac and confirm the patch is applied and health is
   confirmed.
9. Use `stable-live-patch.json` and the offline Stable key only for an approved
   public patch.

Move the Stable private key to encrypted offline storage before public
distribution. The App and repository must contain only public keys.

## 13. Recovery and incident response

### Bad live patch

- Remove the manifest from the public update repository.
- Panel automatically rolls back an unconfirmed or failed patch.
- Increase the sequence before publishing a corrected patch.

### Exposed live-patch private key

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
6. The live-patch filename and channel-specific signature are correct.

## 14. Final release checklist

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
- [ ] The 00:00 and 06:00 refresh-policy transitions pass boundary tests.
- [ ] Status color JSON validation and all metric boundary tests pass.
- [ ] Settings layout keeps all four required rows and contains no field values.
- [ ] Live-patch signature, expiry, sequence, rollback, and field allowlist tests pass.
- [ ] Developer update is tested before Stable release.
- [ ] Public build is notarized.
- [ ] Git changes are reviewed and committed.
