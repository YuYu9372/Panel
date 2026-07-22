# Panel Version and Build Naming

Panel separates the public App version from the detailed Build identifier.

## Public version

The public version follows semantic versioning and is the value shown in the
lower-left corner:

```text
1.0.0
```

The package version, Git tag, update version, and public UI must use the same
value.

## Build identifier

Build identifiers use this format:

```text
{appVersion}+{betaGen}.{buildNum}{channel}{patchNum}
```

Examples:

```text
1.0.0+1.103R
1.0.0+1.103Rp2
1.4.2+14.65D
1.0.0+1.43B
```

The fields mean:

| Field | Meaning |
| --- | --- |
| `appVersion` | Public semantic App version |
| `betaGen` | Positive Beta generation number |
| `buildNum` | Positive Build number; increase it for every source commit |
| `R` | Release build |
| `B` | Beta build |
| `D` | devbeta build |
| `pN` | Optional active Live Patch number, such as `p2` |

The base Build stored in the signed App never contains `pN`. Panel appends it
in memory only after accepting a signed Patch with a positive `patchNumber`.
Changing the bundled file after signing would invalidate the macOS signature.

## VERSION.json

Developer test `1.0.1` uses:

```json
{
  "appVersion": "1.0.1",
  "channel": "devbeta",
  "build": "1.0.1+1.1D",
  "gitTag": "1.0.1",
  "artifact": "panel.dmg",
  "public": false,
  "livePatchCompatibility": ">=1.0.1-alpha.1 <1.0.2"
}
```

Its Electron package version is `1.0.1-alpha.1`. The prerelease suffix is not
shown in Panel's public version label, but it lets Electron correctly upgrade
the developer test to the later stable `1.0.1` release.

Allowed channel names and codes are `Release`/`R`, `Beta`/`B`, and
`devbeta`/`D`. Panel rejects mismatched names and Build suffixes.

The metadata is not secret. It is hidden from the normal interface to keep the
public UI simple, but anyone may inspect it by triple-clicking the public
version or opening the public App bundle.

## Git workflow

Use the public App version for the branch and tag:

```text
branch: 1.0.1
tag:    1.0.1
```

Do not create a branch for every Build. Before each source commit, increase
`buildNum`, update the output directory, run the tests, and commit the matching
metadata and source together.
