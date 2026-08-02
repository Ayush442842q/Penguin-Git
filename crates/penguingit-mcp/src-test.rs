use rmcp::{tool, ServerHandler, ServiceExt};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, schemars::JsonSchema)]
struct PingArgs {
    message: String,
}

#[tool(description = "Ping tool")]
async fn ping(args: PingArgs) -> Result<String, String> {
    Ok(format!("Pong: {}", args.message))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("Testing rmcp macros...");
    Ok(())
}
