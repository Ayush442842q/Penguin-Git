use rmcp::ServiceExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::net::UnixListener;

use crate::core::mcp_event::{get_event_bus, McpMutationEvent, UNIX_SOCKET_PATH};
use crate::core::mcp_server::PenguinMcpServer;

pub static EMBEDDED_MCP_ENABLED: AtomicBool = AtomicBool::new(false);

/// Event emitted to frontend when an MCP tool mutates a repository.
pub const MCP_EVENT: &str = "mcp-event";
/// Repository changed event trigger for live GUI refresh.
pub const REPO_CHANGED_EVENT: &str = "repo-changed";

pub fn is_embedded_enabled() -> bool {
    EMBEDDED_MCP_ENABLED.load(Ordering::Relaxed)
}

pub fn set_embedded_enabled(enabled: bool) {
    EMBEDDED_MCP_ENABLED.store(enabled, Ordering::Relaxed);
}

/// Spawns the Unix domain socket listener and in-process broadcast channel listener for MCP events.
pub fn start_mcp_event_listeners(app_handle: AppHandle) {
    let app = Arc::new(app_handle);

    // 1. In-process broadcast listener (embedded mode)
    let app_broadcast = Arc::clone(&app);
    let mut rx = get_event_bus().subscribe();
    tauri::async_runtime::spawn(async move {
        while let Ok(event) = rx.recv().await {
            emit_mcp_event(&app_broadcast, &event.tool, &event.repo_path);
        }
    });

    // 2. Standalone IPC / Embedded MCP Server over Unix domain socket
    let app_socket = Arc::clone(&app);
    tauri::async_runtime::spawn(async move {
        // Clean up any existing socket file from previous runs
        let _ = std::fs::remove_file(UNIX_SOCKET_PATH);

        if let Ok(listener) = UnixListener::bind(UNIX_SOCKET_PATH) {
            loop {
                if let Ok((stream, _)) = listener.accept().await {
                    let app_conn = Arc::clone(&app_socket);
                    tokio::spawn(async move {
                        let mut reader = tokio::io::BufReader::new(stream);
                        let mut line = String::new();
                        if reader.read_line(&mut line).await.is_ok() && !line.trim().is_empty() {
                            if !line.contains("\"jsonrpc\"") {
                                if let Ok(event) = serde_json::from_str::<McpMutationEvent>(&line) {
                                    emit_mcp_event(&app_conn, &event.tool, &event.repo_path);
                                    return;
                                }
                            }

                            if is_embedded_enabled() {
                                let stream = reader.into_inner();
                                let (read_half, write_half) = stream.into_split();
                                let chained_read =
                                    std::io::Cursor::new(line.into_bytes()).chain(read_half);
                                let server = PenguinMcpServer::new();
                                let _ = server.serve((chained_read, write_half)).await;
                            }
                        }
                    });
                }
            }
        }
    });
}

fn emit_mcp_event(app: &AppHandle, tool: &str, repo_path: &str) {
    let payload = serde_json::json!({
        "tool": tool,
        "repo_path": repo_path,
        "toast": format!("MCP: committed via {}", tool),
    });

    let _ = app.emit(MCP_EVENT, &payload);
    let _ = app.emit(
        REPO_CHANGED_EVENT,
        &serde_json::json!({ "repo_path": repo_path }),
    );
}
