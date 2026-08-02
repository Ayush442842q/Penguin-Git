import { vi } from "vitest";

/**
 * Stub of every `services/tauriBridge` export.
 *
 * Deliberately imports nothing but vitest: `vi.mock` factories are hoisted
 * above a module's own imports, so anything this file pulls in would be
 * evaluated before the mock is installed — and the store imports the very
 * module being mocked, which would make that circular.
 *
 * Keep this list in step with `services/tauriBridge`; `tauriBridge.test.js`
 * asserts the two agree.
 */
export const BRIDGE_FUNCTIONS = [
  "pickRepositoryFolder",
  "openRepo",
  "listOpenRepos",
  "closeRepo",
  "onRepoChanged",
  "getStatus",
  "getLog",
  "getCommitGraph",
  "getFileDiff",
  "getUntrackedDiff",
  "getCommitDiff",
  "getFileHistory",
  "getBlame",
  "stageFile",
  "stageAll",
  "unstageFile",
  "unstageAll",
  "discardFileChanges",
  "discardUntracked",
  "commitChanges",
  "getCommitMessage",
  "cherryPick",
  "revertCommit",
  "resetToCommit",
  "createTag",
  "deleteTag",
  "getBranches",
  "createBranch",
  "deleteBranch",
  "renameBranch",
  "checkout",
  "checkoutNewBranch",
  "mergeBranch",
  "rebaseOnto",
  "getRemotes",
  "addRemote",
  "removeRemote",
  "setRemoteUrl",
  "fetch",
  "pull",
  "push",
  "getStashes",
  "saveStash",
  "getStashDiff",
  "applyStash",
  "popStash",
  "dropStash",
  "getRepoOperationState",
  "readConflictStages",
  "resolveConflict",
  "continueOperation",
  "abortOperation",
  "skipRebase",
  "plainRebase",
  "interactiveRebase",
  "undoLastAction",
  "getUndoHistory",
  "listRecentRepos",
  "forgetRecentRepo",
  "getSubmodules",
  "initSubmodule",
  "updateSubmodule",
];

export function makeBridgeMock() {
  const mock = {
    REPO_CHANGED_EVENT: "repo-changed",
    DEFAULT_LOG_LIMIT: 500,
  };
  for (const name of BRIDGE_FUNCTIONS) {
    mock[name] = vi.fn(() => Promise.resolve());
  }
  mock.getRepoOperationState = vi.fn(() =>
    Promise.resolve({ kind: null, headName: null, onto: null, conflictedPaths: [] })
  );
  // Subscribing returns an unlisten function, not a plain resolve.
  mock.onRepoChanged = vi.fn(() => Promise.resolve(() => {}));
  return mock;
}
