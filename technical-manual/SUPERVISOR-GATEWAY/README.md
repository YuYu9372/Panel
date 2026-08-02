# Panel Supervisor and Gateway Plan

This folder preserves the design discussion for Panel's future modular control
plane, local data gateway, menu bar monitor, recovery system, notifications, and
module-aware Settings interface. It is a design record, not an implementation.

## Confirmed direction

- Panel will use small, independently managed logical modules.
- A central Local Gateway will aggregate data from every module.
- Lifecycle control will remain outside the Gateway so the Gateway can be
  recovered when it fails.
- Two supervisors will exchange heartbeats but will have different authority.
- The existing Settings window will remain the only Settings window.
- Settings will switch between `MASTER` and `NOTIFICATIONS` using a control at
  the bottom of the same window.
- Important failures will appear both inside Panel and through macOS
  notifications.
- Network and general Panel logs will remain separate.
- Safe Mode will use the immutable bundled Baseline and will preserve user data
  and credentials.

## Documents

- [Architecture](ARCHITECTURE.md)
- [Module Lifecycle](MODULE-LIFECYCLE.md)
- [Settings and Notifications](SETTINGS-AND-NOTIFICATIONS.md)
- [Menu Bar and Logging](MENU-BAR-AND-LOGGING.md)
- [Recovery](RECOVERY.md)
- [System Monitor](SYSTEM-MONITOR.md)
- [Open Decisions](OPEN-DECISIONS.md)

## Intended implementation order

1. Define the module contract and health-state schema.
2. Add the App Supervisor registry without changing existing behavior.
3. Add the Local Gateway and compatibility endpoints.
4. Migrate Network Monitor and System Monitor as the first managed modules.
5. Add the single-window Settings controls.
6. Add the native Electron menu bar display.
7. Add macOS and in-app notifications.
8. Add the Rust Recovery Supervisor and macOS service integration.
9. Extend signed Runtime updates toward module-aware activation and rollback.

The menu bar, Electron lifecycle control, notification bridge, native recovery
helper, and macOS service integration require a Full Version Update. After that
Baseline ships, Renderer, Python, layout, and safe policy changes can continue
through signed Runtime Updates where compatible.
