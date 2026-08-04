import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

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

// -- conflict & operation state ------------------------------------------------

export const getRepoOperationState = (repoId) =>
  invoke("get_repo_operation_state", { repoId: { 0: repoId } });

export const readConflictStages = (repoId, path) =>
  invoke("read_conflict_stages", { repoId: { 0: repoId }, path });

export const resolveConflict = (repoId, path, content) =>
  invoke("resolve_conflict", { repoId: { 0: repoId }, path, content });

export const continueOperation = (repoId) =>
  invoke("continue_operation", { repoId: { 0: repoId } });

export const abortOperation = (repoId) => invoke("abort_operation", { repoId: { 0: repoId } });

export const skipRebase = (repoId) => invoke("skip_rebase", { repoId: { 0: repoId } });

// -- rebase -------------------------------------------------------------------

export const plainRebase = (repoId, target) =>
  invoke("plain_rebase", { repoId: { 0: repoId }, target });

export const interactiveRebase = (repoId, baseRef, todoItems) =>
  invoke("interactive_rebase", { repoId: { 0: repoId }, baseRef, todoItems });

// -- undo & redo --------------------------------------------------------------

export const undoLastAction = (repoId) => invoke("undo_last_action", { repoId: { 0: repoId } });
export const redoLastAction = (repoId) => invoke("redo_last_action", { repoId: { 0: repoId } });

export const getUndoHistory = (repoId) =>
  invoke("get_undo_history", repoId ? { repoId: { 0: repoId } } : {});
export const getRedoHistory = (repoId) =>
  invoke("get_redo_history", repoId ? { repoId: { 0: repoId } } : {});

// -- registry -----------------------------------------------------------------

export const listRecentRepos = () => invoke("list_recent_repos");
export const forgetRecentRepo = (id) => invoke("forget_recent_repo", { id });

// -- submodules ---------------------------------------------------------------

export const getSubmodules = (repoPath) => invoke("get_submodules", { repoPath });
export const initSubmodule = (repoPath, submodulePath) =>
  invoke("init_submodule", { repoPath, submodulePath });
export const updateSubmodule = (repoPath, submodulePath) =>
  invoke("update_submodule", { repoPath, submodulePath });

// -- mcp ----------------------------------------------------------------------

export const MCP_EVENT = "mcp-event";
export const getMcpStatus = () => invoke("get_mcp_status");
export const setMcpEnabled = (enabled) => invoke("set_mcp_enabled", { enabled });
export const onMcpEvent = (handler) => listen(MCP_EVENT, handler);

// -- ai & hunk staging --------------------------------------------------------

export const saveAiConfig = (provider, model, apiKey) =>
  invoke("save_ai_config", { provider, model, apiKey: apiKey || null });

export const getAiConfig = () => invoke("get_ai_config");

export const testAiConnection = (provider, model, apiKey) =>
  invoke("test_ai_connection", {
    provider: provider || null,
    model: model || null,
    apiKey: apiKey || null,
  });

export const aiComposeCommitMessage = (repoPath) =>
  invoke("ai_compose_commit_message", { repoPath });

export const aiExplainCommit = (repoPath, hash) => invoke("ai_explain_commit", { repoPath, hash });

export const aiExplainBranch = (repoPath, branch, target) =>
  invoke("ai_explain_branch", { repoPath, branch, target });

export const aiGeneratePrDescription = (repoPath, branch, target) =>
  invoke("ai_generate_pr_description", { repoPath, branch, target });

export const getBranchDiff = (repoPath, branch, target) =>
  invoke("get_branch_diff", { repoPath, branch, target });

export const gitStageHunk = (repoPath, patch) => invoke("git_stage_hunk", { repoPath, patch });

// -- github -------------------------------------------------------------------

export const saveGithubToken = (token) => invoke("save_github_token", { token });
export const getGithubToken = () => invoke("get_github_token");
export const deleteGithubToken = () => invoke("delete_github_token");
export const testGithubConnection = (token) =>
  invoke("test_github_token", { token: token || null });
export const getRepoOrigin = (repoPath) => invoke("get_repo_origin", { repoPath });
export const githubSearchPrs = (repoPath) => invoke("github_search_prs", { repoPath });
export const githubGetLaunchpadItems = (repoPath) =>
  invoke("github_get_launchpad_items", { repoPath });
export const githubGetPr = (repoPath, number) => invoke("github_get_pr", { repoPath, number });
export const githubCreatePr = (repoPath, title, body, head, base) =>
  invoke("github_create_pr", { repoPath, title, body: body || "", head, base });
export const startWorkOnIssue = (repoPath, number, title) =>
  invoke("start_work_on_issue", { repoPath, number, title });

// -- patch --------------------------------------------------------------------

export const exportPatch = (repoPath, commitRange) =>
  invoke("export_patch", { repoPath, commitRange: commitRange || null });

export const previewPatch = (repoPath, patchContent) =>
  invoke("preview_patch", { repoPath, patchContent });

export const applyPatch = (repoPath, patchContent) =>
  invoke("apply_patch", { repoPath, patchContent });

export const readPatchFile = (path) => invoke("read_patch_file", { path });

export async function savePatchFile(defaultName) {
  const selected = await saveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Patch File", extensions: ["patch", "diff"] }],
    title: "Save Patch File",
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickPatchFile() {
  const selected = await openDialog({
    directory: false,
    multiple: false,
    filters: [{ name: "Patch File", extensions: ["patch", "diff"] }],
    title: "Select Patch File to Import",
  });
  return typeof selected === "string" ? selected : null;
}

// -- workspace ----------------------------------------------------------------

export const createWorkspace = (name) => invoke("create_workspace", { name });
export const renameWorkspace = (id, newName) => invoke("rename_workspace", { id, newName });
export const deleteWorkspace = (id) => invoke("delete_workspace", { id });
export const listWorkspaces = () => invoke("list_workspaces");
export const addRepoToWorkspace = (workspaceId, repoId) =>
  invoke("add_repo_to_workspace", { workspaceId, repoId });
export const removeRepoFromWorkspace = (workspaceId, repoId) =>
  invoke("remove_repo_from_workspace", { workspaceId, repoId });
export const listWorkspaceRepos = (workspaceId) => invoke("list_workspace_repos", { workspaceId });

// -- cloud --------------------------------------------------------------------+

export const cloudLogin = (serverUrl, username, password) =>
  invoke("cloud_login", { serverUrl, username, password });
export const cloudLogout = () => invoke("cloud_logout");
export const getCloudSettings = () => invoke("get_cloud_settings");
export const saveCloudSettings = (serverUrl, token) =>
  invoke("save_cloud_settings", { serverUrl, token: token || null });
export const cloudPublishPatch = (
  title,
  description,
  patchData,
  repoName,
  baseCommit,
  workspaceId
) =>
  invoke("cloud_publish_patch", {
    title,
    description: description || null,
    patchData,
    repoName: repoName || null,
    baseCommit: baseCommit || null,
    workspaceId: workspaceId || null,
  });
export const cloudListPatches = () => invoke("cloud_list_patches");
export const cloudAddComment = (patchId, body) => invoke("cloud_add_comment", { patchId, body });
export const cloudListComments = (patchId) => invoke("cloud_list_comments", { patchId });
export const cloudCreateWorkspace = (name) => invoke("cloud_create_workspace", { name });
export const cloudListWorkspaces = () => invoke("cloud_list_workspaces");
