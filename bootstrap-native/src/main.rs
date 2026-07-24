mod archive;
mod manifest;
mod state;

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use clap::{Parser, Subcommand};
use manifest::VerificationContext;
use serde_json::json;
use state::RuntimeStore;

#[derive(Parser)]
#[command(name = "panel-bootstrap", version, about = "Panel Runtime manager")]
struct Cli {
    #[arg(long)]
    root: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Status,
    Verify {
        package: PathBuf,
        #[command(flatten)]
        context: ContextArgs,
    },
    Stage {
        package: PathBuf,
        #[command(flatten)]
        context: ContextArgs,
    },
    Activate,
    Confirm,
    Rollback,
}

#[derive(clap::Args)]
struct ContextArgs {
    #[arg(long)]
    public_key: PathBuf,
    #[arg(long)]
    key_id: String,
    #[arg(long)]
    app_version: String,
    #[arg(long)]
    channel: String,
    #[arg(long)]
    bootstrap_api: u32,
    #[arg(long)]
    runtime_api: u32,
}

impl ContextArgs {
    fn into_context(self) -> VerificationContext {
        let now_epoch_seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or_default();
        VerificationContext {
            public_key_path: self.public_key,
            expected_key_id: self.key_id,
            app_version: self.app_version,
            channel: self.channel,
            bootstrap_api_version: self.bootstrap_api,
            runtime_api_version: self.runtime_api,
            now_epoch_seconds,
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let mut store = RuntimeStore::open(cli.root)?;
    match cli.command {
        Command::Status => println!("{}", serde_json::to_string_pretty(store.state())?),
        Command::Verify { package, context } => {
            let verified = archive::verify_package(&package, &context.into_context())?;
            println!("{}", serde_json::to_string_pretty(&verified.manifest)?);
        }
        Command::Stage { package, context } => {
            let staged = store.stage(&package, &context.into_context())?;
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "status": "staged",
                    "runtimeRevision": staged.revision,
                    "slot": staged.slot,
                }))?
            );
        }
        Command::Activate => {
            let active = store.activate()?;
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "status": "awaitingHealth",
                    "activeSlot": active,
                }))?
            );
        }
        Command::Confirm => {
            store.confirm()?;
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({ "status": "healthy" }))?
            );
        }
        Command::Rollback => {
            let active = store.rollback()?;
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "status": "rolledBack",
                    "activeSlot": active,
                }))?
            );
        }
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("panel-bootstrap: {error}");
        std::process::exit(1);
    }
}
