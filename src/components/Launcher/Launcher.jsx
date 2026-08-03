import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRepoStore } from "../../store/repoStore";
import Workspaces from "../Workspaces/Workspaces";
import "./Launcher.css";

export function Launcher() {
  const navigate = useNavigate();
  const openRepoViaPicker = useRepoStore((s) => s.openRepoViaPicker);
  const openRepo = useRepoStore((s) => s.openRepo);
  const loadRecentRepos = useRepoStore((s) => s.loadRecentRepos);
  const forgetRecentRepo = useRepoStore((s) => s.forgetRecentRepo);
  const recentRepos = useRepoStore((s) => s.recentRepos);
  const loading = useRepoStore((s) => s.loading);

  const [activeTab, setActiveTab] = useState("recent");

  useEffect(() => {
    loadRecentRepos();
  }, [loadRecentRepos]);

  const handleOpenFolder = async () => {
    const success = await openRepoViaPicker();
    if (success) {
      const activeId = useRepoStore.getState().activeRepoId;
      if (activeId) {
        navigate(`/repo/${encodeURIComponent(activeId)}`);
      }
    }
  };

  const handleSelectRecent = async (repoPath) => {
    const success = await openRepo(repoPath);
    if (success) {
      const activeId = useRepoStore.getState().activeRepoId;
      if (activeId) {
        navigate(`/repo/${encodeURIComponent(activeId)}`);
      }
    }
  };

  return (
    <div className="welcome launcher-container">
      <h1 className="welcome-title">PenguinGit</h1>
      <p className="welcome-tagline text-muted">
        A premium, open-source Git GUI built exclusively for Linux.
      </p>

      <div className="launcher-actions">
        <button className="primary welcome-open" disabled={loading} onClick={handleOpenFolder}>
          Open Repository…
        </button>

        <div className="launcher-tabs">
          <button
            className={`launcher-tab ${activeTab === "recent" ? "active" : ""}`}
            onClick={() => setActiveTab("recent")}
          >
            Recent
          </button>
          <button
            className={`launcher-tab ${activeTab === "workspaces" ? "active" : ""}`}
            onClick={() => setActiveTab("workspaces")}
          >
            Workspaces
          </button>
        </div>
      </div>

      {activeTab === "recent" && (
        <div className="welcome-recent">
          {recentRepos && recentRepos.length > 0 ? (
            <>
              <span className="section-label">Recent Repositories</span>
              <ul>
                {recentRepos.map((item) => {
                  const path = typeof item === "string" ? item : item.path;
                  const displayName =
                    item.displayName || item.display_name || path.split("/").pop();
                  const id = item.id || path;
                  const kind = item.kind || "plain";

                  return (
                    <li key={id}>
                      <button
                        className="ghost truncate launcher-repo-btn"
                        title={path}
                        onClick={() => handleSelectRecent(path)}
                      >
                        <span className="launcher-repo-name">{displayName}</span>
                        {kind !== "plain" && (
                          <span className="badge badge-purple launcher-kind-badge">{kind}</span>
                        )}
                        <span className="text-dim welcome-recent-path truncate">{path}</span>
                      </button>
                      <button
                        className="ghost launcher-remove-btn"
                        title="Remove from recent"
                        onClick={(e) => {
                          e.stopPropagation();
                          forgetRecentRepo(id);
                        }}
                      >
                        ⨯
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      )}

      {activeTab === "workspaces" && (
        <div className="launcher-workspaces-wrapper">
          <Workspaces onOpenRepo={handleSelectRecent} />
        </div>
      )}
    </div>
  );
}

export default Launcher;
