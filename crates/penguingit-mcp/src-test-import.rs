mod server;

use rmcp::{transport::stdio::StdIoTransport, ServiceExt};
use server::PenguinMcpServer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let server = PenguinMcpServer::default();
    let transport = StdIoTransport::new();
    let service = server.into_service();
    service.serve(transport).await?;
    Ok(())
}
