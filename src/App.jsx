import { useState, useEffect } from "react";
import { HashRouter, Routes, Route, useParams, useNavigate } from "react-router";
import { useRepoStore, subscribeToRepoChanges } from "./store/repoStore";
import { useResizable } from "./hooks/useResizable";
import Launcher from "./components/Launcher/Launcher";
import RepoTabs from "./components/RepoTabs/RepoTabs";
import Sidebar from "./components/Sidebar/Sidebar";
import CommitGraph from "./components/CommitGraph/CommitGraph";
import DiffViewer from "./components/DiffViewer/DiffViewer";
import StagingPanel from "./components/StagingPanel/StagingPanel";
import ResizeHandle from "./components/ResizeHandle/ResizeHandle";
import { ConflictEditor } from "./components/ConflictEditor/ConflictEditor";
import { RebaseDialog } from "./components/RebaseDialog/RebaseDialog";
import { UndoToast } from "./components/UndoToast/UndoToast";
import Settings from "./components/Settings/Settings";
import McpPanel from "./components/McpPanel/McpPanel";
import Launchpad from "./components/Launchpad/Launchpad";
import "./App.css";

function Header() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const busy = useRepoStore((s) => s.busy);
  const openRepoViaPicker = useRepoStore((s) => s.openRepoViaPicker);
  const closeRepo = useRepoStore((s) => s.closeRepo);
  const [showMcp, setShowMcp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLaunchpad, setShowLaunchpad] = useState(false);

  const status = slice?.status;
  const repo = slice?.repo;

  return (
    <>
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-brand">PenguinGit</span>
          {repo && (
            <>
              <span className="text-dim">/</span>
              <span className="truncate" title={repo.path}>
                {repo.name}
              </span>
            </>
          )}
          {status?.branch && <span className="badge badge-purple">{status.branch}</span>}
          {busy && <span className="text-dim">working…</span>}
        </div>

        <RepoTabs />

        <div className="app-header-right">
          <button className="ghost" onClick={() => setShowLaunchpad(true)} title="Launchpad">
            🚀 Launchpad
          </button>
          <button className="ghost" onClick={() => setShowSettings(true)} title="Settings">
            ⚙ Settings
          </button>
          <button className="ghost" onClick={() => setShowMcp(true)} title="MCP Settings">
            🔌 MCP
          </button>
          <button className="ghost" disabled={busy} onClick={openRepoViaPicker}>
            Open…
          </button>
          {repo && (
            <button className="ghost" disabled={busy} onClick={() => closeRepo(repo.id)}>
              Close
            </button>
          )}
        </div>
      </header>
      <McpPanel isOpen={showMcp} onClose={() => setShowMcp(false)} />
      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <Launchpad isOpen={showLaunchpad} onClose={() => setShowLaunchpad(false)} />
    </>
  );
}

function StatusBar() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const error = useRepoStore((s) => s.error);
  const clearError = useRepoStore((s) => s.clearError);

  if (error) {
    return (
      <footer className="app-statusbar error" onClick={clearError} title="Click to dismiss">
        {error}
      </footer>
    );
  }

  if (!slice) {
    return (
      <footer className="app-statusbar">
        <span>PenguinGit Ready</span>
      </footer>
    );
  }

  const status = slice.status;
  const commits = slice.commits || [];
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

function RepoView() {
  const { repoId: encodedRepoId } = useParams();
  const navigate = useNavigate();
  const repoId = decodeURIComponent(encodedRepoId || "");

  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const setActiveRepoId = useRepoStore((s) => s.setActiveRepoId);
  const slice = useRepoStore((s) => s.repos[repoId]);

  useEffect(() => {
    if (repoId && activeRepoId !== repoId && slice) {
      setActiveRepoId(repoId);
    } else if (!slice && repoId) {
      // If repo not found in open repos, redirect to Launcher
      navigate("/");
    }
  }, [repoId, activeRepoId, slice, setActiveRepoId, navigate]);

  const sidebar = useResizable({
    axis: "x",
    initial: 260,
    min: 180,
    max: 480,
    storageKey: "penguingit:sidebar-w",
  });
  const detail = useResizable({
    axis: "x",
    initial: 340,
    min: 240,
    max: 560,
    storageKey: "penguingit:detail-w",
    reverse: true,
  });
  const graph = useResizable({
    axis: "y",
    initial: 400,
    min: 120,
    max: 900,
    storageKey: "penguingit:graph-h",
  });

  if (!slice || !slice.repo) {
    return <Launcher />;
  }

  const operationState = slice.operationState;
  const activeConflictPath = slice.activeConflictPath;
  const interactiveRebaseModal = slice.interactiveRebaseModal;

  const hasConflict =
    activeConflictPath ||
    (operationState?.conflictedPaths && operationState.conflictedPaths.length > 0) ||
    operationState?.kind != null;

  return (
    <div
      className="app-shell"
      style={{ "--sidebar-w": `${sidebar.size}px`, "--detail-w": `${detail.size}px` }}
    >
      <Header />
      <div className="app-body">
        <Sidebar />
        <ResizeHandle axis="x" onPointerDown={sidebar.onPointerDown} />
        <div className="app-center">
          {hasConflict ? (
            <ConflictEditor path={activeConflictPath} />
          ) : (
            <>
              <CommitGraph style={{ "--graph-h": `${graph.size}px` }} />
              <ResizeHandle axis="y" onPointerDown={graph.onPointerDown} />
              <DiffViewer />
            </>
          )}
        </div>
        <ResizeHandle axis="x" onPointerDown={detail.onPointerDown} />
        <StagingPanel />
      </div>
      <StatusBar />

      {interactiveRebaseModal?.open && (
        <RebaseDialog
          baseRef={interactiveRebaseModal.baseRef}
          initialCommits={interactiveRebaseModal.commits}
        />
      )}

      <UndoToast />
    </div>
  );
}

export default function App() {
  const loadRecentRepos = useRepoStore((s) => s.loadRecentRepos);

  useEffect(() => {
    loadRecentRepos();
    const unlisten = subscribeToRepoChanges();
    return () => {
      unlisten.then((off) => off()).catch(() => {});
    };
  }, [loadRecentRepos]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/repo/:repoId" element={<RepoView />} />
        <Route path="/launchpad" element={<Launchpad />} />
      </Routes>
    </HashRouter>
  );
}
