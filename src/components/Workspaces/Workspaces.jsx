import { useState, useEffect } from "react";
import { useRepoStore } from "../../store/repoStore";
import {
  listWorkspaces,
  createWorkspace,
  deleteWorkspace,
  listWorkspaceRepos,
  addRepoToWorkspace,
  removeRepoFromWorkspace,
  cloudCreateWorkspace,
} from "../../services/tauriBridge";
import "./Workspaces.css";

export default function Workspaces({ onOpenRepo, _isCloudConfigured = false, onShareToCloud }) {
  const recentRepos = useRepoStore((s) => s.recentRepos);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWsId, setSelectedWsId] = useState(null);
  const [wsRepos, setWsRepos] = useState([]);
  const [newWsName, setNewWsName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareSuccess, setShareSuccess] = useState("");

  const fetchWorkspaces = async () => {
    const list = await listWorkspaces();
    setWorkspaces(list);
  };

  const fetchRepos = async (wsId) => {
    const repos = await listWorkspaceRepos(wsId);
    setWsRepos(repos);
  };

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        setLoading(true);
        const list = await listWorkspaces();
        if (active) {
          setWorkspaces(list);
          if (list.length > 0 && !selectedWsId) {
            setSelectedWsId(list[0].id);
          }
        }
      } catch (err) {
        if (active) setError(err.message || String(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [selectedWsId]);

  useEffect(() => {
    let active = true;
    async function loadRepos() {
      if (!selectedWsId) {
        if (active) setWsRepos([]);
        return;
      }
      try {
        const repos = await listWorkspaceRepos(selectedWsId);
        if (active) setWsRepos(repos);
      } catch (err) {
        if (active) setError(err.message || String(err));
      }
    }
    loadRepos();
    return () => {
      active = false;
    };
  }, [selectedWsId]);

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    try {
      const created = await createWorkspace(newWsName.trim());
      setNewWsName("");
      setSelectedWsId(created.id);
      await fetchWorkspaces();
    } catch (err) {
      setError(`Failed to create workspace: ${err.message || String(err)}`);
    }
  };

  const handleDeleteWorkspace = async (wsId) => {
    try {
      await deleteWorkspace(wsId);
      if (selectedWsId === wsId) {
        setSelectedWsId(null);
      }
      await fetchWorkspaces();
    } catch (err) {
      setError(`Failed to delete workspace: ${err.message || String(err)}`);
    }
  };

  const handleAddRepo = async (repoId) => {
    if (!selectedWsId) return;
    try {
      await addRepoToWorkspace(selectedWsId, repoId);
      await fetchRepos(selectedWsId);
    } catch (err) {
      setError(`Failed to add repo: ${err.message || String(err)}`);
    }
  };

  const handleRemoveRepo = async (repoId) => {
    if (!selectedWsId) return;
    try {
      await removeRepoFromWorkspace(selectedWsId, repoId);
      await fetchRepos(selectedWsId);
    } catch (err) {
      setError(`Failed to remove repo: ${err.message || String(err)}`);
    }
  };

  const handleShareToCloud = async (ws) => {
    try {
      if (onShareToCloud) {
        await onShareToCloud(ws);
      } else {
        await cloudCreateWorkspace(ws.name);
      }
      setShareSuccess(`Workspace "${ws.name}" published to Cloud Server!`);
      setTimeout(() => setShareSuccess(""), 4000);
    } catch (err) {
      setError(`Failed to share workspace to Cloud: ${err.message || String(err)}`);
    }
  };

  const selectedWs = workspaces.find((w) => w.id === selectedWsId);
  const availableToAdd = recentRepos.filter((r) => !wsRepos.some((wr) => wr.id === r.id));

  if (loading && workspaces.length === 0) {
    return <div className="workspaces-container">Loading workspaces…</div>;
  }

  return (
    <div className="workspaces-container">
      {error && (
        <div className="workspaces-error" onClick={() => setError(null)}>
          {error} (click to dismiss)
        </div>
      )}
      {shareSuccess && <div className="workspaces-success-banner">{shareSuccess}</div>}

      <div className="workspaces-layout">
        {/* Left Sidebar: Workspace List */}
        <div className="workspaces-sidebar">
          <form className="workspace-create-form" onSubmit={handleCreateWorkspace}>
            <input
              type="text"
              className="workspace-input"
              placeholder="New Workspace Name..."
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
            />
            <button type="submit" className="btn-primary-sm" disabled={!newWsName.trim()}>
              + Add
            </button>
          </form>

          <div className="workspace-list">
            {workspaces.length === 0 ? (
              <p className="text-dim text-sm p-2">No workspaces created yet.</p>
            ) : (
              workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`workspace-item ${selectedWsId === ws.id ? "active" : ""}`}
                  onClick={() => setSelectedWsId(ws.id)}
                >
                  <span className="workspace-name truncate">📁 {ws.name}</span>
                  <button
                    className="btn-icon-danger"
                    title="Delete workspace"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWorkspace(ws.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Content: Repos in Selected Workspace */}
        <div className="workspace-details">
          {selectedWs ? (
            <>
              <div className="workspace-header">
                <div>
                  <h3>📁 {selectedWs.name}</h3>
                  <span className="text-dim text-xs">
                    Created {new Date(selectedWs.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="btn-secondary-sm"
                  onClick={() => handleShareToCloud(selectedWs)}
                  title="Share workspace to Cloud backend"
                >
                  ☁️ Share to Cloud
                </button>
              </div>

              <div className="workspace-section">
                <h4>Repositories in Workspace ({wsRepos.length})</h4>
                {wsRepos.length === 0 ? (
                  <p className="text-dim text-sm">No repositories added to this workspace yet.</p>
                ) : (
                  <div className="ws-repo-grid">
                    {wsRepos.map((repo) => (
                      <div key={repo.id} className="ws-repo-card">
                        <div
                          className="ws-repo-info"
                          onClick={() => onOpenRepo && onOpenRepo(repo.path)}
                        >
                          <span className="ws-repo-title">📦 {repo.displayName}</span>
                          <span className="ws-repo-path truncate">{repo.path}</span>
                        </div>
                        <button
                          className="btn-link-danger"
                          title="Remove from workspace"
                          onClick={() => handleRemoveRepo(repo.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {availableToAdd.length > 0 && (
                <div className="workspace-section">
                  <h4>Add Recent Repository</h4>
                  <div className="ws-add-list">
                    {availableToAdd.map((repo) => (
                      <button
                        key={repo.id}
                        className="ws-add-btn"
                        onClick={() => handleAddRepo(repo.id)}
                      >
                        + Add {repo.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="workspace-empty">
              <p className="text-dim">
                Select or create a workspace to manage grouped repositories.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
