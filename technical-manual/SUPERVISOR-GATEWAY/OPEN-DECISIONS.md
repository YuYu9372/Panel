# Open Decisions

The following details remain proposals and require confirmation before
implementation:

1. Use a rolling sixty-second window for Menu Bar Ping average and maximum.
2. Keep the exact label `Quit Menu Bar Display` or change it to `Hide Menu Bar
   Display` for clearer behavior.
3. Show both `Panel 1.1.0` and `Release 2026.8.2` in the Menu Bar version line.
4. Confirm the initial module heartbeat, failure, and restart-backoff timings.
5. Decide whether network sound uses a licensed `ping.mp3` asset or the macOS
   system notification sound.
6. Define the System Monitor screen changes in the next design discussion.
7. Decide which optional modules may persist in a disabled state across Panel
   restarts.
8. Decide whether successful automatic recovery produces a macOS notification
   by default or only an in-app message.
9. Define retention limits for Panel Log, Network Log, and module event history.
10. Decide when module-aware Runtime activation becomes a release requirement.

Confirmed decisions should move from this file into the appropriate design
document so the implementation contract remains unambiguous.
