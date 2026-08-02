import { useRepoStore } from "../store/repoStore";

export function setTestRepoState(override = {}) {
  const repo = override.repo || { id: "/repo", path: "/repo", name: "repo", headBranch: "main" };
  const slice = {
    repo,
    status: override.status !== undefined ? override.status : null,
    commits: override.commits || [],
    layout: override.layout || { rows: [], laneCount: 0 },
    branches: override.branches || [],
    remotes: override.remotes || [],
    stashes: override.stashes || [],
    submodules: override.submodules || [],
    operationState: override.operationState || {
      kind: null,
      headName: null,
      onto: null,
      conflictedPaths: [],
    },
    activeConflictPath: override.activeConflictPath || null,
    interactiveRebaseModal: override.interactiveRebaseModal || null,
    selectedCommit: override.selectedCommit || null,
    selectedFile: override.selectedFile || null,
  };

  useRepoStore.setState({
    repos: { [repo.id]: slice },
    activeRepoId: repo.id,
    recentRepos: override.recentRepos || [],
    loading: override.loading || false,
    error: override.error || null,
    busy: override.busy || false,
    undoToast: override.undoToast || null,
  });
}
