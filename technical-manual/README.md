# Panel Technical Manual

Panel has three update methods. Choose the method by what you changed.

| What changed? | Method | Ready now? |
| --- | --- | --- |
| Anything, including Electron and security code | Full Version Update | Yes |
| HTML, CSS, JavaScript, Python, and feature code | Runtime Update | No, planned |
| Colors, labels, layout, refresh rules, and safe settings | Standard Live Patch | Yes |

## Simple decision

```text
Changed program code?
Use Full Version Update today.

Changed only supported JSON settings or appearance?
Use Standard Live Patch.

Want to update code without a normal App installation?
Runtime Update will provide this after it is implemented.
```

## Files in this manual

- [Full Version Update](FULL-VERSION-UPDATE.md)
- [Runtime Update](RUNTIME-UPDATE.md)
- [Standard Live Patch](STANDARD-LIVE-PATCH.md)

The detailed security and architecture design remains available in
[`docs/UPDATE_ARCHITECTURE.md`](../docs/UPDATE_ARCHITECTURE.md).
