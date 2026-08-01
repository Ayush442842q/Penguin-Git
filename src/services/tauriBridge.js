import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

/**
 * Typed wrappers around Tauri's `invoke()`.
 *
 * The frontend never builds command names or argument objects inline — every
 * call goes through a named function here, so a renamed Rust command surfaces
 * as one broken import rather than a runtime error deep in a component.
 */

/** Event the Rust watcher emits when a repository changes on disk. */
export const REPO_CHANGED_EVENT = "repo-changed";

/** Default number of commits fetched for the graph. */
export const DEFAULT_LOG_LIMIT = 500;

// -- repo ---------------------------------------------------------------------

/**
 * Shows the native folder picker.
 *
 * Replaces the prototype's raw text input for the repo path — a text field
 * can't validate, can't autocomplete, and puts the burden of typing an exact
 * absolute path on the user.
 *
 * @returns {Promise<string | null>} chosen path, or null if cancelled
 */
export async function pickRepositoryFolder() {
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: "Open Repository",
  });
  return typeof selected === "string" ? selected : null;
}

export const openRepo = (path) => invoke("open_repo", { path });
export const listOpenRepos = () => invoke("list_open_repos");
export const closeRepo = (repoId) => invoke("close_repo", { repoId });

/**
 * Subscribes to repository-changed events.
 * @returns {Promise<() => void>} unlisten function
 */
export const onRepoChanged = (handler) => listen(REPO_CHANGED_EVENT, handler);

// -- status / log -------------------------------------------------------------

export const getStatus = (repoPath) => invoke("get_git_status", { repoPath });

export const getLog = (repoPath, limit = DEFAULT_LOG_LIMIT) =>
  invoke("get_git_log", { repoPath, limit });

export const getCommitGraph = (repoPath, limit = DEFAULT_LOG_LIMIT) =>
  invoke("get_commit_graph", { repoPath, limit });

// -- diff ---------------------------------------------------------------------

export const getFileDiff = (repoPath, path, staged) =>
  invoke("get_file_diff", { repoPath, path, staged });

export const getUntrackedDiff = (repoPath, path) =>
  invoke("get_untracked_diff", { repoPath, path });

export const getCommitDiff = (repoPath, hash) => invoke("get_commit_diff", { repoPath, hash });

export const getFileHistory = (repoPath, path, limit = 100) =>
  invoke("get_file_history", { repoPath, path, limit });

export const getBlame = (repoPath, path) => invoke("get_blame", { repoPath, path });

// -- staging ------------------------------------------------------------------

export const stageFile = (repoPath, path) => invoke("stage_file", { repoPath, path });
export const stageAll = (repoPath) => invoke("stage_all", { repoPath });
export const unstageFile = (repoPath, path) => invoke("unstage_file", { repoPath, path });
export const unstageAll = (repoPath) => invoke("unstage_all", { repoPath });
export const discardFileChanges = (repoPath, path) =>
  invoke("discard_file_changes", { repoPath, path });
export const discardUntracked = (repoPath, path) => invoke("discard_untracked", { repoPath, path });

// -- commits ------------------------------------------------------------------

export const commitChanges = (repoPath, subject, body, amend = false) =>
  invoke("commit_changes", { repoPath, subject, body: body || null, amend });

export const getCommitMessage = (repoPath, hash) =>
  invoke("get_commit_message", { repoPath, hash });
export const cherryPick = (repoPath, hash) => invoke("cherry_pick", { repoPath, hash });
export const revertCommit = (repoPath, hash) => invoke("revert_commit", { repoPath, hash });

/** @param {"soft" | "mixed" | "hard"} mode */
export const resetToCommit = (repoPath, hash, mode) =>
  invoke("reset_to_commit", { repoPath, hash, mode });

export const createTag = (repoPath, name, hash, message) =>
  invoke("create_tag", { repoPath, name, hash, message: message || null });

export const deleteTag = (repoPath, name) => invoke("delete_tag", { repoPath, name });

// -- branches -----------------------------------------------------------------

export const getBranches = (repoPath) => invoke("get_branches", { repoPath });

export const createBranch = (repoPath, name, startPoint) =>
  invoke("create_branch", { repoPath, name, startPoint: startPoint || null });

export const deleteBranch = (repoPath, name, force = false) =>
  invoke("delete_branch", { repoPath, name, force });

export const renameBranch = (repoPath, oldName, newName) =>
  invoke("rename_branch", { repoPath, old: oldName, new: newName });

export const checkout = (repoPath, target) => invoke("checkout", { repoPath, target });

export const checkoutNewBranch = (repoPath, name, startPoint) =>
  invoke("checkout_new_branch", { repoPath, name, startPoint: startPoint || null });

export const mergeBranch = (repoPath, branchName) =>
  invoke("merge_branch", { repoPath, branchName });
export const rebaseOnto = (repoPath, onto) => invoke("rebase_onto", { repoPath, onto });

// -- remotes ------------------------------------------------------------------

export const getRemotes = (repoPath) => invoke("get_remotes", { repoPath });
export const addRemote = (repoPath, name, url) => invoke("add_remote", { repoPath, name, url });
export const removeRemote = (repoPath, name) => invoke("remove_remote", { repoPath, name });
export const setRemoteUrl = (repoPath, name, url) =>
  invoke("set_remote_url", { repoPath, name, url });

export const fetch = (repoPath, remoteName) =>
  invoke("fetch", { repoPath, remoteName: remoteName || null });

export const pull = (repoPath) => invoke("pull", { repoPath });

export const push = (repoPath, remoteName, branchName, setUpstream = false) =>
  invoke("push", {
    repoPath,
    remoteName: remoteName || null,
    branchName: branchName || null,
    setUpstream,
  });

// -- stash --------------------------------------------------------------------

export const getStashes = (repoPath) => invoke("get_stashes", { repoPath });

export const saveStash = (repoPath, message, includeUntracked = true) =>
  invoke("save_stash", { repoPath, message: message || null, includeUntracked });

export const getStashDiff = (repoPath, index) => invoke("get_stash_diff", { repoPath, index });

// Stash positions renumber on every push/pop/drop, so each of these also sends
// the hash the UI list was showing. The backend refuses the operation if the
// stack moved underneath us rather than acting on whatever now sits at `index`.

/** Restores the stash and keeps it — deliberately not the same as {@link popStash}. */
export const applyStash = (repoPath, index, hash) =>
  invoke("apply_stash", { repoPath, index, hash });

/** Restores the stash and removes it — deliberately not the same as {@link applyStash}. */
export const popStash = (repoPath, index, hash) => invoke("pop_stash", { repoPath, index, hash });

export const dropStash = (repoPath, index, hash) => invoke("drop_stash", { repoPath, index, hash });
