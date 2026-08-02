import { vi } from "vitest";
import { useRepoStore } from "../store/repoStore";

export { makeBridgeMock, BRIDGE_FUNCTIONS } from "./bridgeMock";

/**
 * Shared test fixtures and store setup.
 */

export const REPO = { id: "/repo", path: "/repo", name: "repo", headBranch: "main" };

export const CLEAN_STATUS = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
};

export const file = (path, kind, extra = {}) => ({
  path,
  kind,
  originalPath: null,
  similarity: null,
  ...extra,
});

export const commit = (hash, subject, overrides = {}) => ({
  hash,
  shortHash: hash.slice(0, 7),
  authorName: "Ada Lovelace",
  authorEmail: "ada@example.invalid",
  timestamp: 1_700_000_000,
  parents: [],
  refs: [],
  subject,
  ...overrides,
});

/** A graph row as `core::log::compute_lanes` emits it. */
export const row = (hash, lane, overrides = {}) => ({
  hash,
  lane,
  incoming: [],
  outgoing: [],
  mergedFrom: [],
  ...overrides,
});

export const stash = (index, message, overrides = {}) => ({
  index,
  hash: `stashhash${index}`,
  message,
  branch: "main",
  timestamp: 1_700_000_000,
  ...overrides,
});

export const branch = (name, overrides = {}) => ({
  name,
  isRemote: false,
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  tip: "aaaaaaa",
  subject: `tip of ${name}`,
  ...overrides,
});

/** Resets the store to a known state, applying `overrides` on top. */
export function setStore(overrides = {}) {
  const repo = overrides.repo !== undefined ? overrides.repo : REPO;
  const repoId = repo ? repo.id : null;

  const currentRepos = useRepoStore.getState().repos || {};

  const slice = repoId
    ? {
        repo,
        status: overrides.status !== undefined ? overrides.status : CLEAN_STATUS,
        commits: overrides.commits !== undefined ? overrides.commits : [],
        layout: overrides.layout !== undefined ? overrides.layout : { rows: [], laneCount: 0 },
        branches: overrides.branches !== undefined ? overrides.branches : [],
        remotes: overrides.remotes !== undefined ? overrides.remotes : [],
        stashes: overrides.stashes !== undefined ? overrides.stashes : [],
        submodules: overrides.submodules !== undefined ? overrides.submodules : [],
        operationState:
          overrides.operationState !== undefined
            ? overrides.operationState
            : { kind: null, headName: null, onto: null, conflictedPaths: [] },
        activeConflictPath:
          overrides.activeConflictPath !== undefined ? overrides.activeConflictPath : null,
        interactiveRebaseModal:
          overrides.interactiveRebaseModal !== undefined ? overrides.interactiveRebaseModal : null,
        selectedCommit: overrides.selectedCommit !== undefined ? overrides.selectedCommit : null,
        selectedFile: overrides.selectedFile !== undefined ? overrides.selectedFile : null,
      }
    : null;

  const repos = repoId ? { ...currentRepos, [repoId]: slice } : {};

  useRepoStore.setState({
    repos,
    activeRepoId: repoId,
    repo,
    status: slice ? slice.status : null,
    commits: slice ? slice.commits : [],
    layout: slice ? slice.layout : { rows: [], laneCount: 0 },
    branches: slice ? slice.branches : [],
    remotes: slice ? slice.remotes : [],
    stashes: slice ? slice.stashes : [],
    submodules: slice ? slice.submodules : [],
    operationState: slice
      ? slice.operationState
      : { kind: null, headName: null, onto: null, conflictedPaths: [] },
    activeConflictPath: slice ? slice.activeConflictPath : null,
    interactiveRebaseModal: slice ? slice.interactiveRebaseModal : null,
    selectedCommit: slice ? slice.selectedCommit : null,
    selectedFile: slice ? slice.selectedFile : null,
    recentRepos: overrides.recentRepos !== undefined ? overrides.recentRepos : [],
    loading: overrides.loading !== undefined ? overrides.loading : false,
    error: overrides.error !== undefined ? overrides.error : null,
    busy: overrides.busy !== undefined ? overrides.busy : false,
    undoToast: overrides.undoToast !== undefined ? overrides.undoToast : null,
    ...(overrides.run ? { run: overrides.run } : {}),
  });
}

/**
 * Captures the operation passed to `store.run(...)` instead of executing the
 * real one, so a test can assert *which* bridge call a button wires up.
 */
export function captureRunCalls() {
  const calls = [];
  useRepoStore.setState({
    run: vi.fn(async (operation) => {
      calls.push(operation);
      await operation(REPO.path);
      return true;
    }),
  });
  return calls;
}
