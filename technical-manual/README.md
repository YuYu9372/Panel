# Panel Technical Manual

Panel has three update methods. Choose the method by what you changed.

| What changed? | Method | Ready now? |
| --- | --- | --- |
| Anything, including Electron and security code | Full Version Update | Yes |
| HTML, CSS, Renderer JavaScript, Python, and feature code | Runtime Update | Developer channel ready |
| Colors, labels, layout, refresh rules, and safe settings | Standard Live Patch | Yes |

## Simple decision

```text
Changed program code?
Use Runtime Update for allowlisted Renderer or Python files.

Changed Electron main, preload, Rust, trust keys, or native dependencies?
Use Full Version Update.

Changed only supported JSON settings or appearance?
Use Standard Live Patch.

Want to update code without a normal App installation?
Publish a signed Runtime package, then let the user download and apply it from
Panel's update card.
```

## Files in this manual

- [Full Version Update](FULL-VERSION-UPDATE.md)
- [Runtime Update](RUNTIME-UPDATE.md)
- [Rust Bootstrap Basics](RUST-BOOTSTRAP-BASICS.md)
- [Standard Live Patch](STANDARD-LIVE-PATCH.md)
- [Supervisor and Gateway Plan](SUPERVISOR-GATEWAY/README.md)

The detailed security and architecture design remains available in
[`docs/UPDATE_ARCHITECTURE.md`](../docs/UPDATE_ARCHITECTURE.md).
