# Full Version Update

## Use it for

Use a Full Version Update when you change any program code or when you are not
sure which update method is safe.

It can update everything:

- Electron
- HTML, CSS, and JavaScript
- Python
- preload and IPC
- update security
- icons and App resources

## Simple workflow

```text
Create branch
→ Make changes
→ Increase version and Build
→ Test
→ Build DMG and ZIP
→ Commit and push
→ Merge PR
→ Create tag and GitHub Release
```

## Commands

Replace `NEXT_VERSION` and `NEXT_BUILD` with the real values.

```bash
git switch main
git pull --ff-only origin main
git switch -c NEXT_VERSION
```

After editing the source and version files:

```bash
npm test
npm audit --audit-level=low
npm run dist
```

Commit and push:

```bash
git add <changed-files>
gitleaks git --staged
git commit -m "Build Panel NEXT_BUILD"
git push -u origin NEXT_VERSION
```

Create and merge a PR. Then update local `main`:

```bash
git switch main
git pull --ff-only origin main
```

Create the tag:

```bash
git tag -a NEXT_VERSION -m "Panel NEXT_VERSION"
git push origin NEXT_VERSION
```

Create the GitHub Release and upload all matching artifacts:

- `panel.dmg`
- `panel.zip`
- both block maps
- `latest-mac.yml` or `alpha-mac.yml`
- `VERSION.json`

## Result

Panel downloads the full update. The user approves installation, and Panel uses
`quitAndInstall` to start the new Baseline.
