use penguingit_lib::core::mcp_event::UNIX_SOCKET_PATH;
use penguingit_lib::core::mcp_server::PenguinMcpServer;
use rmcp::ServiceExt;
use std::env;
use std::path::Path;
use tokio::net::{TcpListener, UnixListener};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    let server = PenguinMcpServer::new();

    if let Some(pos) = args.iter().position(|a| a == "--socket") {
        let socket_path = args
            .get(pos + 1)
            .map(|s| s.as_str())
            .unwrap_or(UNIX_SOCKET_PATH);

        if Path::new(socket_path).exists() {
            let _ = std::fs::remove_file(socket_path);
        }

        println!("PenguinGit Engine listening on Unix socket: {socket_path}");
        let listener = UnixListener::bind(socket_path)?;

        loop {
            let (stream, _) = listener.accept().await?;
            let (read_half, write_half) = stream.into_split();
            let server_clone = server.clone();
            tokio::spawn(async move {
                let _ = server_clone.serve((read_half, write_half)).await;
            });
        }
    } else if let Some(pos) = args.iter().position(|a| a == "--tcp") {
        let addr = args
            .get(pos + 1)
            .map(|s| s.as_str())
            .unwrap_or("127.0.0.1:34284");

        println!("PenguinGit Engine listening on TCP: {addr}");
        let listener = TcpListener::bind(addr).await?;

        loop {
            let (stream, _) = listener.accept().await?;
            let (read_half, write_half) = stream.into_split();
            let server_clone = server.clone();
            tokio::spawn(async move {
                let _ = server_clone.serve((read_half, write_half)).await;
            });
        }
    } else {
        // Default: stdio transport
        let running = server.serve(rmcp::transport::stdio()).await?;
        running.waiting().await?;
        Ok(())
    }
}
