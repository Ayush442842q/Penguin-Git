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
import * as git from "./services/tauriBridge";
import "./App.css";

function Header({ panels }) {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const busy = useRepoStore((s) => s.busy);
  const run = useRepoStore((s) => s.run);
  const openRepoViaPicker = useRepoStore((s) => s.openRepoViaPicker);
  const closeRepo = useRepoStore((s) => s.closeRepo);
  const triggerUndo = useRepoStore((s) => s.triggerUndo);
  const triggerRedo = useRepoStore((s) => s.triggerRedo);

  const [showMcp, setShowMcp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLaunchpad, setShowLaunchpad] = useState(false);

  const status = slice?.status;
  const repo = slice?.repo;
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const hasUpstream = !!status?.upstream;

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

        {repo && (
          <div className="toolbar-actions">
            <button
              className="toolbar-btn"
              disabled={busy}
              onClick={triggerUndo}
              title="Undo (Ctrl+Z)"
            >
              <span className="toolbar-icon">↺</span>
              <span className="toolbar-label">Undo</span>
            </button>
            <button
              className="toolbar-btn"
              disabled={busy}
              onClick={triggerRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <span className="toolbar-icon">↻</span>
              <span className="toolbar-label">Redo</span>
            </button>

            <span className="toolbar-divider" />

            <button
              className="toolbar-btn"
              disabled={busy}
              onClick={() => run((path) => git.fetch(path, null))}
              title="Fetch remote changes"
            >
              <span className="toolbar-icon">⇊</span>
              <span className="toolbar-label">Fetch</span>
            </button>
            <button
              className="toolbar-btn"
              disabled={busy}
              onClick={() => run(git.pull)}
              title="Pull changes from upstream"
            >
              <span className="toolbar-icon">↓</span>
              <span className="toolbar-label">Pull</span>
              {behind > 0 && <span className="badge badge-blue">{behind}</span>}
            </button>
            <button
              className="toolbar-btn"
              disabled={busy}
              title={hasUpstream ? "Push to upstream" : "Push and set upstream"}
              onClick={() =>
                run((path) =>
                  git.push(
                    path,
                    hasUpstream ? null : "origin",
                    hasUpstream ? null : status?.branch,
                    !hasUpstream
                  )
                )
              }
            >
              <span className="toolbar-icon">↑</span>
              <span className="toolbar-label">Push</span>
              {ahead > 0 && <span className="badge badge-green">{ahead}</span>}
            </button>

            <span className="toolbar-divider" />

            <button
              className="toolbar-btn"
              disabled={busy}
              onClick={() => run((path) => git.stashSave(path, null, false))}
              title="Stash working changes"
            >
              <span className="toolbar-icon">📦</span>
              <span className="toolbar-label">Stash</span>
            </button>
            <button
              className="toolbar-btn"
              disabled={busy}
              onClick={() => run((path) => git.stashPop(path, 0))}
              title="Pop latest stash"
            >
              <span className="toolbar-icon">📤</span>
              <span className="toolbar-label">Pop</span>
            </button>
          </div>
        )}

        <div className="app-header-right">
          {panels && (
            <div className="panel-toggles">
              <button
                className={`ghost icon-toggle${panels.sidebar.collapsed ? " active" : ""}`}
                onClick={panels.sidebar.toggleCollapsed}
                title={panels.sidebar.collapsed ? "Show sidebar" : "Hide sidebar"}
                aria-label={panels.sidebar.collapsed ? "Show sidebar" : "Hide sidebar"}
              >
                ◧
              </button>
              <button
                className={`ghost icon-toggle${panels.graph.collapsed ? " active" : ""}`}
                onClick={panels.graph.toggleCollapsed}
                title={panels.graph.collapsed ? "Show commit graph" : "Hide commit graph"}
                aria-label={panels.graph.collapsed ? "Show commit graph" : "Hide commit graph"}
              >
                ⬒
              </button>
              <button
                className={`ghost icon-toggle${panels.detail.collapsed ? " active" : ""}`}
                onClick={panels.detail.toggleCollapsed}
                title={panels.detail.collapsed ? "Show detail panel" : "Hide detail panel"}
                aria-label={panels.detail.collapsed ? "Show detail panel" : "Hide detail panel"}
              >
                ◨
              </button>
            </div>
          )}
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
        <div className="statusbar-left">
          <span>PenguinGit Ready</span>
        </div>
        <div className="statusbar-right">
          <span className="version-tag">v1.1.1</span>
        </div>
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
      <div className="statusbar-left">
        <span>{commits.length} commits</span>
        <span className="statusbar-dot">•</span>
        <span>{changes === 0 ? "working tree clean" : `${changes} changed`}</span>
        {status?.upstream && (
          <>
            <span className="statusbar-dot">•</span>
            <span>
              {status.upstream} · ↑{status.ahead} ↓{status.behind}
            </span>
          </>
        )}
      </div>

      <div className="statusbar-right">
        <span className="badge badge-purple">PRO</span>
        <span className="version-tag">v1.1.1</span>
      </div>
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
      style={{
        "--sidebar-w": `${sidebar.collapsed ? 0 : sidebar.size}px`,
        "--detail-w": `${detail.collapsed ? 0 : detail.size}px`,
      }}
    >
      <Header panels={{ sidebar, detail, graph }} />
      <div className="app-body">
        <Sidebar />
        <ResizeHandle
          axis="x"
          onPointerDown={sidebar.onPointerDown}
          collapsed={sidebar.collapsed}
          onToggleCollapse={sidebar.toggleCollapsed}
          collapseDirection="start"
          label="sidebar"
        />
        <div className="app-center">
          {hasConflict ? (
            <ConflictEditor path={activeConflictPath} />
          ) : (
            <>
              <CommitGraph style={{ "--graph-h": graph.collapsed ? "0px" : `${graph.size}px` }} />
              <ResizeHandle
                axis="y"
                onPointerDown={graph.onPointerDown}
                collapsed={graph.collapsed}
                onToggleCollapse={graph.toggleCollapsed}
                label="commit graph"
              />
              <DiffViewer />
            </>
          )}
        </div>
        <ResizeHandle
          axis="x"
          onPointerDown={detail.onPointerDown}
          collapsed={detail.collapsed}
          onToggleCollapse={detail.toggleCollapsed}
          collapseDirection="end"
          label="detail panel"
        />
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
