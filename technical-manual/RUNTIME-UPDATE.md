# Runtime Update

## Current status

Runtime Update is planned but is not implemented yet.

Do not look for a Runtime build or signing command in the current project. Until
this feature is finished, use a Full Version Update for HTML, CSS, JavaScript,
Python, or other program-code changes.

## Future purpose

Runtime Update will allow these files to update without a normal DMG installation:

- HTML and CSS
- Renderer JavaScript and Widgets
- Python services
- images, fonts, and feature assets
- compatible Electron main and preload code

## Planned simple workflow

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

## User experience

The user will click a Runtime Update button. Panel will show:

```text
Downloading
Verifying
Preparing
Restarting services
Checking health
Complete
```

Panel will keep an active slot and a previous slot. A failed Runtime starts the
previous slot automatically.

## Important boundary

Runtime Update will not replace the Bootstrap, root signature verifier, embedded
public keys, recovery manager, or update process. Those components require a Full
Version Update.
