use penguingit_lib::core::mcp_server::PenguinMcpServer;
use rmcp::ServiceExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let server = PenguinMcpServer::new();
    let running = server.serve(rmcp::transport::stdio()).await?;
    running.waiting().await?;
    Ok(())
}
