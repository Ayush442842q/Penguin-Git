import { useState, useEffect } from "react";
import { getCloudSettings, cloudLogin, cloudLogout } from "../../services/tauriBridge";
import "./CloudPanel.css";

export default function CloudPanel() {
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ connected: false, serverUrl: "", user: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      try {
        const config = await getCloudSettings();
        if (active && config) {
          setServerUrl(config.serverUrl || "http://localhost:3000");
          if (config.token) {
            setStatus({ connected: true, serverUrl: config.serverUrl });
          }
        }
      } catch (err) {
        console.error("Failed to load cloud settings:", err);
      }
    }
    loadConfig();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!serverUrl.trim() || !username.trim() || !password.trim()) {
      setError("Server URL, Username, and Password are required");
      return;
    }

    setLoading(true);
    try {
      await cloudLogin(serverUrl.trim(), username.trim(), password.trim());
      setStatus({ connected: true, serverUrl: serverUrl.trim() });
      setSuccessMsg("Successfully connected to PenguinGit Cloud Server!");
      setPassword("");
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to authenticate with cloud server");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await cloudLogout();
      setStatus({ connected: false, serverUrl: "" });
      setSuccessMsg("Disconnected from PenguinGit Cloud Server.");
    } catch (err) {
      setError(typeof err === "string" ? err : "Logout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cloud-panel">
      <div className="cloud-panel-header">
        <h3>Cloud Server Integration</h3>
        <span className={`cloud-status-badge ${status.connected ? "connected" : "disconnected"}`}>
          {status.connected ? `Connected (${status.serverUrl})` : "Disconnected"}
        </span>
      </div>

      <p className="cloud-panel-description">
        Connect to a self-hosted PenguinGit Cloud server to share patches, comment on diffs, and
        collaborate across teams.
      </p>

      {error && <div className="cloud-alert cloud-alert-error">{error}</div>}
      {successMsg && <div className="cloud-alert cloud-alert-success">{successMsg}</div>}

      {status.connected ? (
        <div className="cloud-connected-card">
          <div className="cloud-info-row">
            <span className="cloud-info-label">Server URL:</span>
            <span className="cloud-info-value">{status.serverUrl}</span>
          </div>
          <button
            className="cloud-btn cloud-btn-secondary"
            onClick={handleLogout}
            disabled={loading}
          >
            {loading ? "Disconnecting..." : "Disconnect Server"}
          </button>
        </div>
      ) : (
        <form className="cloud-form" onSubmit={handleLogin}>
          <div className="cloud-form-group">
            <label htmlFor="cloud-server-url">Server URL</label>
            <input
              id="cloud-server-url"
              type="text"
              className="cloud-input"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:3000"
              disabled={loading}
            />
          </div>

          <div className="cloud-form-group">
            <label htmlFor="cloud-username">Username</label>
            <input
              id="cloud-username"
              type="text"
              className="cloud-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              disabled={loading}
            />
          </div>

          <div className="cloud-form-group">
            <label htmlFor="cloud-password">Password</label>
            <input
              id="cloud-password"
              type="password"
              className="cloud-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button type="submit" className="cloud-btn cloud-btn-primary" disabled={loading}>
            {loading ? "Connecting..." : "Connect Server"}
          </button>
        </form>
      )}
    </div>
  );
}
