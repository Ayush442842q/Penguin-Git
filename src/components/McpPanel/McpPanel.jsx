import { useState, useEffect } from "react";
import * as git from "../../services/tauriBridge";
import "./McpPanel.css";

export function McpPanel({ isOpen, onClose }) {
  const [status, setStatus] = useState({
    embeddedEnabled: false,
    socketPath: "/tmp/penguingit-mcp.sock",
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      git
        .getMcpStatus()
        .then((res) => setStatus(res))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = async () => {
    const nextState = !status.embeddedEnabled;
    try {
      const res = await git.setMcpEnabled(nextState);
      setStatus(res);
    } catch (err) {
      console.error("Failed to toggle MCP server:", err);
    }
  };

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        penguingit: {
          command: "penguingit-mcp",
          args: [],
        },
      },
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(mcpConfigSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mcp-modal-backdrop" onClick={onClose}>
      <div className="mcp-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-modal-header">
          <h2>MCP Server Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="mcp-modal-body">
          {/* Embedded Server Toggle */}
          <div className="mcp-section">
            <div className="mcp-setting-row">
              <div>
                <h3>Embedded MCP Server</h3>
                <p className="text-dim">
                  Run the MCP server in-process inside PenguinGit, sharing state with the GUI.
                </p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={status.embeddedEnabled} onChange={handleToggle} />
                <span className="slider"></span>
              </label>
            </div>

            <div className="mcp-status-card">
              <span className="status-label">Status:</span>
              <span className={`badge ${status.embeddedEnabled ? "badge-green" : "badge-gray"}`}>
                {status.embeddedEnabled ? "Embedded Active" : "Embedded Disabled"}
              </span>
              <span className="socket-label text-dim">
                IPC Socket: <code>{status.socketPath}</code>
              </span>
            </div>
          </div>

          {/* External Client Setup Documentation */}
          <div className="mcp-section">
            <h3>External MCP Client Configuration</h3>
            <p className="text-dim">
              To connect external AI clients (e.g., Claude Desktop) to PenguinGit MCP server, add
              this snippet to your <code>mcp.json</code>:
            </p>

            <div className="mcp-code-box">
              <button className="copy-btn ghost" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <pre>
                <code>{mcpConfigSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default McpPanel;
