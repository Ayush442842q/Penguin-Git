import { useState, useEffect } from "react";
import { useRepoStore } from "../../store/repoStore";
import {
  getGithubToken,
  saveGithubToken,
  deleteGithubToken,
  testGithubConnection,
  getRepoOrigin,
} from "../../services/tauriBridge";
import "./GitHubPanel.css";

export default function GitHubPanel() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const activeRepoPath = useRepoStore((s) => s.repos[activeRepoId]?.repo?.path);

  const [patInput, setPatInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originInfo, setOriginInfo] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const tokenStatus = await getGithubToken();
        if (active) setHasToken(!!tokenStatus);
      } catch (err) {
        if (active) setHasToken(false);
      }

      if (activeRepoPath) {
        try {
          const origin = await getRepoOrigin(activeRepoPath);
          if (active) setOriginInfo(origin);
        } catch (err) {
          if (active) setOriginInfo(null);
        }
      } else {
        if (active) setOriginInfo(null);
      }

      if (active) setLoading(false);
    }

    loadData();
    return () => {
      active = false;
    };
  }, [activeRepoPath]);

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMessage(null);
    try {
      const username = await testGithubConnection(patInput || undefined);
      setStatusMessage({
        type: "success",
        text: `✓ Connection successful! Authenticated as @${username}`,
      });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: `Connection failed: ${err.message || String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!patInput.trim()) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      await saveGithubToken(patInput);
      setHasToken(true);
      setPatInput("");
      setStatusMessage({ type: "success", text: "✓ GitHub PAT saved to keychain!" });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: `Failed to save token: ${err.message || String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearToken = async () => {
    setStatusMessage(null);
    try {
      await deleteGithubToken();
      setHasToken(false);
      setPatInput("");
      setStatusMessage({ type: "success", text: "GitHub PAT cleared from keychain." });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: `Failed to clear token: ${err.message || String(err)}`,
      });
    }
  };

  if (loading) {
    return <div className="github-panel">Loading GitHub integration settings…</div>;
  }

  return (
    <form className="github-panel" onSubmit={handleSave}>
      <div className="github-panel-header">
        <h3>GitHub Integration Settings</h3>
        <p>
          Configure a GitHub Personal Access Token (PAT) for PR and issue inbox features in Launchpad.
        </p>
      </div>

      {statusMessage && (
        <div className={`github-status-msg ${statusMessage.type}`}>{statusMessage.text}</div>
      )}

      <div className="github-form-group">
        <label htmlFor="github-pat-input">Personal Access Token (PAT)</label>
        <input
          id="github-pat-input"
          type="password"
          className="github-input"
          placeholder={hasToken ? "•••••••••••••••• (Token saved in Keychain)" : "Enter GitHub PAT"}
          value={patInput}
          onChange={(e) => setPatInput(e.target.value)}
          autoComplete="off"
        />
        <div className="github-key-status">
          <span>Status:</span>
          {hasToken ? (
            <span className="key-badge saved">✓ Saved in Keychain</span>
          ) : (
            <span className="key-badge missing">No Token Saved</span>
          )}
          {hasToken && (
            <button
              type="button"
              className="btn-link"
              onClick={handleClearToken}
              title="Clear saved token"
            >
              Clear Token
            </button>
          )}
        </div>
      </div>

      <div className="github-form-group">
        <label>Detected Remote Origin</label>
        <div className="origin-display">
          {originInfo ? (
            <span className="origin-badge">
              🐙 <strong>{originInfo.owner}</strong> / {originInfo.repo}
            </span>
          ) : (
            <span className="text-dim">
              {activeRepoPath
                ? "No GitHub origin remote detected for active repo"
                : "No repository currently open"}
            </span>
          )}
        </div>
      </div>

      <div className="github-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={testing || saving || (!hasToken && !patInput)}
          onClick={handleTestConnection}
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={saving || testing || !patInput.trim()}
        >
          {saving ? "Saving…" : "Save PAT"}
        </button>
      </div>
    </form>
  );
}
