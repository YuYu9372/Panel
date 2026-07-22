# Rust Bootstrap Basics

Panel uses Rust for the small trusted Runtime manager because Rust provides native
code without a garbage collector and prevents many memory-safety errors at compile
time.

## Project layout

```text
bootstrap-native/
├── Cargo.toml
├── Cargo.lock
└── src/
    ├── main.rs
    ├── manifest.rs
    ├── archive.rs
    └── state.rs
```

`Cargo.toml` defines the package and dependencies. `Cargo.lock` records the exact
dependency versions. `main.rs` defines the CLI, while the other files are modules
for signature verification, ZIP validation, and A/B state.

## Five ideas used here

1. A `struct` groups related values. `RuntimeState` is the saved A/B state.
2. An `enum` lists allowed alternatives. `Command` lists the CLI commands.
3. `Result<T, E>` means an operation returns either a value or a typed error.
4. `&Path` borrows a path temporarily; `PathBuf` owns a path that can be stored.
5. `?` returns an error to the caller immediately, keeping the successful path
   short.

Rust ownership prevents two parts of the program from changing the same value in
unsafe ways. Borrowing with `&` lets a function use a value without taking it away
from its owner.

## Useful commands

```bash
cargo fmt --manifest-path bootstrap-native/Cargo.toml
cargo test --manifest-path bootstrap-native/Cargo.toml
cargo clippy --manifest-path bootstrap-native/Cargo.toml --all-targets -- -D warnings
cargo build --release --manifest-path bootstrap-native/Cargo.toml
```

`fmt` formats code, `test` runs the security and state tests, `clippy` finds common
mistakes, and `build --release` produces the optimized executable.

## Safe editing rule

Keep the Rust Bootstrap small. Feature UI belongs in the replaceable Runtime.
Signature checks, trusted keys, A/B switching, health decisions, and rollback belong
in the Bootstrap and change only through a Full Version Update.
