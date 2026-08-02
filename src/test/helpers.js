import { vi } from "vitest";
import { useRepoStore } from "../store/repoStore";

export { makeBridgeMock, BRIDGE_FUNCTIONS } from "./bridgeMock";

/**
 * Shared test fixtures and store setup.
 *
 * Every component reads from `useRepoStore` and calls through
 * `services/tauriBridge`, so tests need both stubbed the same way. Centralising
 * that here keeps each test file about the behaviour it is actually asserting.
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
  useRepoStore.setState({
    repo: REPO,
    status: CLEAN_STATUS,
    commits: [],
    layout: { rows: [], laneCount: 0 },
    branches: [],
    remotes: [],
    stashes: [],
    recentRepos: [],
    loading: false,
    error: null,
    busy: false,
    selectedCommit: null,
    selectedFile: null,
    ...overrides,
  });
}

/**
 * Captures the operation passed to `store.run(...)` instead of executing the
 * real one, so a test can assert *which* bridge call a button wires up without
 * needing the whole refresh cycle to resolve.
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
