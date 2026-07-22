# Panel Updates and Signed Live Patches

Panel uses two deliberately separate update paths.

| Path | Can change | Verification | Recovery |
| --- | --- | --- | --- |
| Full App update | Electron, Python, dashboard logic, preload, and all UI | electron-updater SHA-512 metadata plus the macOS application signature | Install only after verification; publish a higher fixed version to recover a bad release |
| Live patch | Complete validated status-color, refresh-policy, and Settings-layout JSON plus update-card text and allowlisted visual tokens | Independent Ed25519 signature, HTTPS, channel, sequence, expiry, App-version range, and strict field validation | Atomic activation, renderer health confirmation, previous-patch rollback |

Live patches cannot contain HTML, arbitrary JavaScript, API endpoints, preload
code, Python, credentials, or changes that disable manual Calendar and Tasks
refresh. This restriction is intentional. A full App update is required when
behavior or security-sensitive code changes.

In App Core 0.5.2_D and later, `settingsLayout` may change only the Settings title, the
four field labels, and the order of the four mandatory fields. It cannot remove
mask/reveal, Test connections, Save, or update verification, and it cannot
carry field values. Secrets always remain in the encrypted per-user store.

## Channels

- **Stable** maps to electron-updater's `latest` channel and the stable patch
  signing key.
- **Developer** maps to the `alpha` channel and the developer patch signing key.
- Changing channels never enables version downgrades.
- Each Mac stores its own choice in its owner-only settings file.

Use Stable on a public device and Developer on the test device.

## Artifact repository

The source repository may remain private. Update artifacts should be published
from a separate public repository named `YuYu9372/Panel-Updates`. The client
contains no GitHub token and must never receive a private-repository PAT.

The repository does not exist yet, so the update client reports a safe check
failure until it is created and the first release is published. Compromising
the repository would not be enough to forge a live patch because the separate
Ed25519 signature is still required. Full App updates are protected by the
macOS application signature.

## Full App release

1. For a Developer build, use a semantic version such as
   `0.5.3-alpha.1`, set the GitHub publish channel to `alpha`, and select
   Developer in Panel Settings.
2. For a Stable build, use a version such as `0.5.3`, set the publish channel to
   `latest`, and select Stable in Panel Settings.
3. Run `npm test` and `npm audit`.
4. Run `npm run dist`. The macOS build produces DMG and ZIP artifacts plus
   update metadata. ZIP is the automatic-update payload; DMG remains the manual
   installer.
5. Verify the DMG checksum and the nested App signature.
6. Sign with a **Developer ID Application** certificate and notarize with Apple
   before a public release. An Apple Development certificate is suitable only
   for local testing.
7. Upload the generated DMG, ZIP, channel metadata, and block maps to the
   matching GitHub release in `Panel-Updates`.
8. Install the release on the Developer device first. Promote a separately
   built Stable release only after validation.

electron-builder requires the macOS ZIP target for automatic updates and
generates `latest-mac.yml` or channel-specific metadata. See the
[electron-builder auto-update guide](https://www.electron.build/docs/features/auto-update/)
and [channel guide](https://www.electron.build/docs/tutorials/release-using-channels/).

## Live-patch release

The private keys created for this project are outside the repository under:

`/Users/yu/Library/Application Support/Panel Developer/update-signing/`

The App contains only the corresponding public keys. Move
`stable-private.pem` to encrypted offline storage before public distribution.
Keep the Developer key separate so frequent test signing cannot compromise the
Stable channel.

Install release 0.5.2 with App Core 0.5.2_D or later before publishing a patch that contains
`settingsLayout`. C accepts status colors and refresh policy but safely rejects
the new Settings layout field. B supports only the earlier update-card fields.

1. Copy `patches/developer-live-patch.example.json` and edit the draft.
2. Increase `sequence`. A used sequence is never accepted again, even after a
   rollback.
3. Keep `appVersionRange` narrow and set `lifetimeDays` from 1 to 30.
4. Sign the draft:

   ```bash
   PANEL_PATCH_SIGNING_KEY='/Users/your-name/Library/Application Support/Panel Developer/update-signing/developer-private.pem' \
   PANEL_PATCH_KEY_ID='panel-developer-2026-01' \
   npm run sign:patch -- patches/developer-live-patch.example.json dist/developer-live-patch.json
   ```

5. Commit only the signed output as `patches/developer-live-patch.json` in the
   public artifact repository. Use the Stable key and
   `patches/stable-live-patch.json` only for
   approved public patches. The fixed files work independently of whether the
   newest full-App release is Stable or a Developer prerelease.
6. Panel verifies the patch before an atomic write. The immutable renderer
   applies allowlisted values immediately, reschedules Calendar and Tasks,
   updates an open Settings screen using existing controls, and confirms
   health. If it crashes or reports a failure before confirmation, the next
   launch restores the previous patch.

## Incident response

- A bad unsigned or modified patch is rejected without changing the active configuration.
- A signed patch that fails health validation rolls back automatically and its
  sequence remains blocked.
- If a private patch key is exposed, remove the manifest, ship a full signed App
  update with a replacement public key, and retire the affected key ID.
- If a full release is bad, publish a higher fixed version. Reusing the same
  version does not recover devices that already installed it.
