use std::sync::OnceLock;
use tokio::sync::broadcast;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMutationEvent {
    pub tool: String,
    pub repo_path: String,
}

pub const UNIX_SOCKET_PATH: &str = "/tmp/penguingit-mcp.sock";

static EVENT_BUS: OnceLock<broadcast::Sender<McpMutationEvent>> = OnceLock::new();

pub fn get_event_bus() -> &'static broadcast::Sender<McpMutationEvent> {
    EVENT_BUS.get_or_init(|| {
        let (tx, _rx) = broadcast::channel(100);
        tx
    })
}

/// Sends a mutation notification to both the in-process broadcast channel AND the Unix domain socket.
pub async fn notify_mcp_mutation(tool: &str, repo_path: &str) {
    let event = McpMutationEvent {
        tool: tool.to_string(),
        repo_path: repo_path.to_string(),
    };

    // 1. In-process broadcast bus
    let _ = get_event_bus().send(event.clone());

    // 2. Standalone IPC over Unix domain socket
    if let Ok(mut stream) = tokio::net::UnixStream::connect(UNIX_SOCKET_PATH).await {
        use tokio::io::AsyncWriteExt;
        if let Ok(json) = serde_json::to_string(&event) {
            let mut data = json.into_bytes();
            data.push(b'\n');
            let _ = stream.write_all(&data).await;
        }
    }
}
