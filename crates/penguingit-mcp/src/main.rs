pub mod server;

use rmcp::ServiceExt;
use server::PenguinMcpServer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let server = PenguinMcpServer::new();
    let running = server.serve(rmcp::transport::stdio()).await?;
    running.waiting().await?;
    Ok(())
}
