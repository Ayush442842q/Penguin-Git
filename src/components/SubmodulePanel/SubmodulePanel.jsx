import { useNavigate } from "react-router-dom";
import { useRepoStore } from "../../store/repoStore";
import "./SubmodulePanel.css";

export function SubmodulePanel() {
  const navigate = useNavigate();

  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const initSubmodule = useRepoStore((s) => s.initSubmodule);
  const updateSubmodule = useRepoStore((s) => s.updateSubmodule);
  const openRepo = useRepoStore((s) => s.openRepo);
  const busy = useRepoStore((s) => s.busy);

  if (!slice || !slice.repo) return null;

  const submodules = slice.submodules || [];
  const repoPath = slice.repo.path;

  const handleOpenAsRepo = async (submodulePath) => {
    const absolutePath = `${repoPath}/${submodulePath}`;
    const success = await openRepo(absolutePath);
    if (success) {
      const activeId = useRepoStore.getState().activeRepoId;
      if (activeId) {
        navigate(`/repo/${encodeURIComponent(activeId)}`);
      }
    }
  };

  return (
    <div className="submodule-panel">
      <div className="submodule-header">
        <span className="section-label">Submodules ({submodules.length})</span>
      </div>

      {submodules.length === 0 ? (
        <div className="submodule-empty text-dim">No submodules found</div>
      ) : (
        <ul className="submodule-list">
          {submodules.map((sub) => {
            const shortSha = sub.sha ? sub.sha.substring(0, 7) : "";
            const displayName = sub.name || sub.path.split("/").pop();

            return (
              <li key={sub.path} className="submodule-item">
                <div className="submodule-info">
                  <div className="submodule-title-row">
                    <span className="submodule-name" title={sub.path}>
                      {displayName}
                    </span>
                    <span className="submodule-sha">{shortSha}</span>
                  </div>
                  {sub.url && (
                    <div className="submodule-url text-dim truncate" title={sub.url}>
                      {sub.url}
                    </div>
                  )}
                  <div className="submodule-badges">
                    {sub.initialized ? (
                      <span className="badge badge-success">Initialized</span>
                    ) : (
                      <span className="badge badge-warning">Uninitialized</span>
                    )}
                    {sub.hasChanges && <span className="badge badge-danger">Modified</span>}
                  </div>
                </div>

                <div className="submodule-actions">
                  {!sub.initialized ? (
                    <button
                      className="ghost sm"
                      disabled={busy}
                      title="Initialize submodule"
                      onClick={() => initSubmodule(sub.path)}
                    >
                      Init
                    </button>
                  ) : (
                    <button
                      className="ghost sm"
                      disabled={busy}
                      title="Update submodule"
                      onClick={() => updateSubmodule(sub.path)}
                    >
                      Update
                    </button>
                  )}

                  <button
                    className="ghost sm"
                    disabled={busy}
                    title="Open submodule as a separate repository tab"
                    onClick={() => handleOpenAsRepo(sub.path)}
                  >
                    Open as Repo
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SubmodulePanel;
