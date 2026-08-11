import { useNavigate } from "react-router";
import { useRepoStore } from "../../store/repoStore";
import "./RepoTabs.css";

export function RepoTabs() {
  const navigate = useNavigate();
  const repos = useRepoStore((s) => s.repos);
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const setActiveRepoId = useRepoStore((s) => s.setActiveRepoId);
  const closeRepo = useRepoStore((s) => s.closeRepo);
  const openRepoViaPicker = useRepoStore((s) => s.openRepoViaPicker);

  const openRepoIds = Object.keys(repos);

  const handleSelectTab = (id) => {
    setActiveRepoId(id);
    navigate(`/repo/${encodeURIComponent(id)}`);
  };

  const handleCloseTab = async (e, id) => {
    e.stopPropagation();
    await closeRepo(id);
    const updatedIds = Object.keys(useRepoStore.getState().repos);
    if (updatedIds.length > 0) {
      const nextId = useRepoStore.getState().activeRepoId || updatedIds[0];
      navigate(`/repo/${encodeURIComponent(nextId)}`);
    } else {
      navigate("/");
    }
  };

  const handleNewTab = async () => {
    const success = await openRepoViaPicker();
    if (success) {
      const activeId = useRepoStore.getState().activeRepoId;
      if (activeId) {
        navigate(`/repo/${encodeURIComponent(activeId)}`);
      }
    } else {
      navigate("/");
    }
  };

  return (
    <div className="repo-tabs-container">
      <div className="repo-tabs-scroll">
        {openRepoIds.map((id) => {
          const slice = repos[id];
          const repo = slice?.repo;
          if (!repo) return null;
          const isActive = id === activeRepoId;

          return (
            <div
              key={id}
              className={`repo-tab-item ${isActive ? "active" : ""}`}
              onClick={() => handleSelectTab(id)}
              title={repo.path}
            >
              <span className="repo-tab-icon">📁</span>
              <span className="repo-tab-name">{repo.name}</span>
              <button
                className="repo-tab-close"
                title="Close repository"
                onClick={(e) => handleCloseTab(e, id)}
              >
                ⨯
              </button>
            </div>
          );
        })}
      </div>
      <button className="repo-tabs-add" title="Open repository in new tab" onClick={handleNewTab}>
        +
      </button>
    </div>
  );
}

export default RepoTabs;
