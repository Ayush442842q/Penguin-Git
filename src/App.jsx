import { useEffect } from "react";
import { useRepoStore, subscribeToRepoChanges } from "./store/repoStore";
import Sidebar from "./components/Sidebar/Sidebar";
import CommitGraph from "./components/CommitGraph/CommitGraph";
import DiffViewer from "./components/DiffViewer/DiffViewer";
import StagingPanel from "./components/StagingPanel/StagingPanel";
import "./App.css";

function WelcomeScreen() {
  const openRepoViaPicker = useRepoStore((s) => s.openRepoViaPicker);
  const openRepo = useRepoStore((s) => s.openRepo);
  const forgetRecentRepo = useRepoStore((s) => s.forgetRecentRepo);
  const recentRepos = useRepoStore((s) => s.recentRepos);
  const loading = useRepoStore((s) => s.loading);

  return (
    <div className="welcome">
      <h1 className="welcome-title">PenguinGit</h1>
      <p className="welcome-tagline text-muted">
        A premium, open-source Git GUI built exclusively for Linux.
      </p>

      <button className="primary welcome-open" disabled={loading} onClick={openRepoViaPicker}>
        Open Repository…
      </button>

      {recentRepos.length > 0 && (
        <div className="welcome-recent">
          <span className="section-label">Recent</span>
          <ul>
            {recentRepos.map((path) => (
              <li key={path}>
                <button className="ghost truncate" title={path} onClick={() => openRepo(path)}>
                  {path.split("/").pop()}
                  <span className="text-dim welcome-recent-path truncate">{path}</span>
                </button>
                <button
                  className="ghost"
                  title="Remove from recent"
                  onClick={() => forgetRecentRepo(path)}
                >
                  ⨯
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Header() {
  const repo = useRepoStore((s) => s.repo);
  const status = useRepoStore((s) => s.status);
  const busy = useRepoStore((s) => s.busy);
  const openRepoViaPicker = useRepoStore((s) => s.openRepoViaPicker);
  const closeRepo = useRepoStore((s) => s.closeRepo);

  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-brand">PenguinGit</span>
        <span className="text-dim">/</span>
        <span className="truncate" title={repo.path}>
          {repo.name}
        </span>
        {status?.branch && <span className="badge badge-purple">{status.branch}</span>}
        {busy && <span className="text-dim">working…</span>}
      </div>
      <div className="app-header-right">
        {/* Disabled while a git operation is running: switching or closing the
            repository mid-write leaves the UI describing one repo and the
            operation finishing against another. */}
        <button className="ghost" disabled={busy} onClick={openRepoViaPicker}>
          Open…
        </button>
        <button className="ghost" disabled={busy} onClick={closeRepo}>
          Close
        </button>
      </div>
    </header>
  );
}

function StatusBar() {
  const status = useRepoStore((s) => s.status);
  const commits = useRepoStore((s) => s.commits);
  const error = useRepoStore((s) => s.error);
  const clearError = useRepoStore((s) => s.clearError);

  if (error) {
    return (
      <footer className="app-statusbar error" onClick={clearError} title="Click to dismiss">
        {error}
      </footer>
    );
  }

  const changes = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  return (
    <footer className="app-statusbar">
      <span>{commits.length} commits</span>
      <span>{changes === 0 ? "working tree clean" : `${changes} changed`}</span>
      {status?.upstream && (
        <span>
          {status.upstream} · ↑{status.ahead} ↓{status.behind}
        </span>
      )}
    </footer>
  );
}

export default function App() {
  const repo = useRepoStore((s) => s.repo);

  // Live updates come from the Rust filesystem watcher. There is deliberately
  // no polling interval anywhere in this app.
  useEffect(() => {
    const unlisten = subscribeToRepoChanges();
    return () => {
      unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  if (!repo) return <WelcomeScreen />;

  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <Sidebar />
        <div className="app-center">
          <CommitGraph />
          <DiffViewer />
        </div>
        <StagingPanel />
      </div>
      <StatusBar />
    </div>
  );
}
