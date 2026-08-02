import { create } from "zustand";
import * as git from "../services/tauriBridge";

const RECENT_REPOS_KEY = "penguingit.recentRepos";
const MAX_RECENT_REPOS = 10;

/** Recent repo paths are UI convenience, not secrets — localStorage is fine here. */
function loadRecentRepos() {
  try {
    const raw = localStorage.getItem(RECENT_REPOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistRecentRepos(repos) {
  try {
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(repos));
  } catch {
    // A full or disabled localStorage shouldn't break opening repositories.
  }
}

/**
 * Central repository state.
 *
 * Refreshes are driven entirely by the Rust watcher's `repo-changed` event —
 * there is deliberately no polling anywhere in this store. The prototype
 * re-ran every git command on a 6-second interval whether or not anything had
 * changed, which burned CPU and still lagged behind real edits.
 */
export const useRepoStore = create((set, get) => ({
  repo: null,
  status: null,
  commits: [],
  layout: { rows: [], laneCount: 0 },
  branches: [],
  remotes: [],
  stashes: [],
  recentRepos: loadRecentRepos(),

  operationState: { kind: null, headName: null, onto: null, conflictedPaths: [] },
  activeConflictPath: null,
  interactiveRebaseModal: null, // { open: true, baseRef: '...', commits: [] }
  undoToast: null, // { id, description, timestamp }

  loading: false,
  error: null,
  /** Set while a mutating git operation is in flight, to disable double-clicks. */
  busy: false,

  selectedCommit: null,
  selectedFile: null,

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
  selectCommit: (selectedCommit) => set({ selectedCommit, selectedFile: null }),
  selectFile: (selectedFile) => set({ selectedFile }),
  openConflictEditor: (path) => set({ activeConflictPath: path }),
  closeConflictEditor: () => set({ activeConflictPath: null }),
  openInteractiveRebase: (baseRef, commits) =>
    set({ interactiveRebaseModal: { open: true, baseRef, commits } }),
  closeInteractiveRebase: () => set({ interactiveRebaseModal: null }),
  setUndoToast: (undoToast) => set({ undoToast }),
  dismissUndoToast: () => set({ undoToast: null }),

  triggerUndo: async () => {
    const { repo } = get();
    if (!repo) return false;
    try {
      const snapshot = await git.undoLastAction(repo.path);
      set({ undoToast: { message: `Undid: ${snapshot.description}`, undone: true } });
      await get().refresh();
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  /** Opens the native folder picker, then the chosen repository. */
  openRepoViaPicker: async () => {
    const path = await git.pickRepositoryFolder();
    if (!path) return false;
    return get().openRepo(path);
  },

  openRepo: async (path) => {
    set({ loading: true, error: null });
    try {
      const repo = await git.openRepo(path);
      const recentRepos = [repo.path, ...get().recentRepos.filter((p) => p !== repo.path)].slice(
        0,
        MAX_RECENT_REPOS
      );
      persistRecentRepos(recentRepos);

      set({ repo, recentRepos, selectedCommit: null, selectedFile: null });
      await get().refresh();
      return true;
    } catch (error) {
      // Only report the failure. Clearing `repo` here would close the working
      // repository because the user mistyped a *different* path — losing their
      // place for an error that had nothing to do with it.
      set({ error: String(error) });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  closeRepo: async () => {
    const { repo } = get();
    if (repo) await git.closeRepo(repo.id).catch(() => {});
    set({
      repo: null,
      status: null,
      commits: [],
      layout: { rows: [], laneCount: 0 },
      branches: [],
      remotes: [],
      stashes: [],
      selectedCommit: null,
      selectedFile: null,
    });
  },

  forgetRecentRepo: (path) => {
    const recentRepos = get().recentRepos.filter((p) => p !== path);
    persistRecentRepos(recentRepos);
    set({ recentRepos });
  },

  /**
   * Reloads everything for the open repo.
   *
   * Fetched in parallel because none of these depend on each other, and a
   * serial chain would make the post-commit refresh visibly stagger.
   */
  refresh: async () => {
    const { repo } = get();
    if (!repo) return;
    const requestedFor = repo.id;

    try {
      const [status, graph, branches, remotes, stashes, operationState] = await Promise.all([
        git.getStatus(repo.path),
        git.getCommitGraph(repo.path),
        git.getBranches(repo.path),
        git.getRemotes(repo.path),
        git.getStashes(repo.path),
        git.getRepoOperationState(repo.path).catch(() => ({
          kind: null,
          headName: null,
          onto: null,
          conflictedPaths: [],
        })),
      ]);

      // The user can switch or close the repository while these are in flight.
      // Writing anyway would paint one repository's commits, branches, and
      // stashes over another's — and the stash indices would then point into
      // the wrong stack.
      if (get().repo?.id !== requestedFor) return;

      set({
        status,
        commits: graph.commits,
        layout: graph.layout,
        branches,
        remotes,
        stashes,
        operationState,
        error: null,
      });
    } catch (error) {
      if (get().repo?.id !== requestedFor) return;
      set({ error: String(error) });
    }
  },

  /**
   * Runs a mutating git operation, then refreshes.
   *
   * The explicit refresh isn't redundant with the watcher: it makes the UI
   * respond immediately rather than after the debounce window, and it covers
   * operations that touch nothing the watcher looks at.
   */
  run: async (operation) => {
    const { repo } = get();
    if (!repo) return false;

    const requestedFor = repo.id;
    set({ busy: true, error: null });
    try {
      await operation(repo.path);
      if (get().repo?.id !== requestedFor) return false;
      await get().refresh();
      return true;
    } catch (error) {
      if (get().repo?.id === requestedFor) set({ error: String(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));

/**
 * Wires the store to the Rust watcher.
 *
 * Called once at app startup. Returns an unlisten function.
 */
export async function subscribeToRepoChanges() {
  return git.onRepoChanged(() => {
    useRepoStore.getState().refresh();
  });
}
