import { create } from "zustand";
import * as git from "../services/tauriBridge";

export const createEmptyRepoSlice = (repo) => ({
  repo,
  status: null,
  commits: [],
  layout: { rows: [], laneCount: 0 },
  branches: [],
  remotes: [],
  stashes: [],
  submodules: [],
  operationState: { kind: null, headName: null, onto: null, conflictedPaths: [] },
  activeConflictPath: null,
  interactiveRebaseModal: null,
  selectedCommit: null,
  selectedFile: null,
});

/**
 * Multi-repository store.
 *
 * `repos`: Record<RepoId, RepoSlice>
 * `activeRepoId`: currently active repository ID
 * Top-level fields (repo, status, commits, etc.) mirror the active repo slice
 * for maximum convenience and backward compatibility.
 */
export const useRepoStore = create((set, get) => ({
  repos: {},
  activeRepoId: null,
  recentRepos: [],

  repo: null,
  status: null,
  commits: [],
  layout: { rows: [], laneCount: 0 },
  branches: [],
  remotes: [],
  stashes: [],
  submodules: [],
  operationState: { kind: null, headName: null, onto: null, conflictedPaths: [] },
  activeConflictPath: null,
  interactiveRebaseModal: null,
  selectedCommit: null,
  selectedFile: null,

  undoToast: null,
  loading: false,
  error: null,
  busy: false,

  getActiveSlice: () => {
    const { repos, activeRepoId } = get();
    return activeRepoId ? repos[activeRepoId] || null : null;
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  syncActiveTopLevel: (targetRepoId = get().activeRepoId) => {
    const slice = targetRepoId ? get().repos[targetRepoId] : null;
    if (slice) {
      set({
        repo: slice.repo,
        status: slice.status,
        commits: slice.commits,
        layout: slice.layout,
        branches: slice.branches,
        remotes: slice.remotes,
        stashes: slice.stashes,
        submodules: slice.submodules,
        operationState: slice.operationState,
        activeConflictPath: slice.activeConflictPath,
        interactiveRebaseModal: slice.interactiveRebaseModal,
        selectedCommit: slice.selectedCommit,
        selectedFile: slice.selectedFile,
      });
    } else {
      set({
        repo: null,
        status: null,
        commits: [],
        layout: { rows: [], laneCount: 0 },
        branches: [],
        remotes: [],
        stashes: [],
        submodules: [],
        operationState: { kind: null, headName: null, onto: null, conflictedPaths: [] },
        activeConflictPath: null,
        interactiveRebaseModal: null,
        selectedCommit: null,
        selectedFile: null,
      });
    }
  },

  setActiveRepoId: (activeRepoId) => {
    set({ activeRepoId });
    get().syncActiveTopLevel(activeRepoId);
    if (activeRepoId) {
      get().refresh(activeRepoId);
    }
  },

  loadRecentRepos: async () => {
    try {
      const recent = await git.listRecentRepos();
      set({ recentRepos: recent });
    } catch {
      set({ recentRepos: [] });
    }
  },

  selectCommit: (selectedCommit) => {
    const activeRepoId = get().activeRepoId;
    if (!activeRepoId) return;
    set((state) => {
      const updatedSlice = {
        ...state.repos[activeRepoId],
        selectedCommit,
        selectedFile: null,
      };
      return {
        selectedCommit,
        selectedFile: null,
        repos: {
          ...state.repos,
          [activeRepoId]: updatedSlice,
        },
      };
    });
  },

  selectFile: (selectedFile) => {
    const activeRepoId = get().activeRepoId;
    if (!activeRepoId) return;
    set((state) => {
      const updatedSlice = {
        ...state.repos[activeRepoId],
        selectedFile,
      };
      return {
        selectedFile,
        repos: {
          ...state.repos,
          [activeRepoId]: updatedSlice,
        },
      };
    });
  },

  openConflictEditor: (path) => {
    const activeRepoId = get().activeRepoId;
    if (!activeRepoId) return;
    set((state) => {
      const updatedSlice = {
        ...state.repos[activeRepoId],
        activeConflictPath: path,
      };
      return {
        activeConflictPath: path,
        repos: {
          ...state.repos,
          [activeRepoId]: updatedSlice,
        },
      };
    });
  },

  closeConflictEditor: () => {
    const activeRepoId = get().activeRepoId;
    if (!activeRepoId) return;
    set((state) => {
      const updatedSlice = {
        ...state.repos[activeRepoId],
        activeConflictPath: null,
      };
      return {
        activeConflictPath: null,
        repos: {
          ...state.repos,
          [activeRepoId]: updatedSlice,
        },
      };
    });
  },

  openInteractiveRebase: (baseRef, commits) => {
    const activeRepoId = get().activeRepoId;
    if (!activeRepoId) return;
    const modal = { open: true, baseRef, commits };
    set((state) => {
      const updatedSlice = {
        ...state.repos[activeRepoId],
        interactiveRebaseModal: modal,
      };
      return {
        interactiveRebaseModal: modal,
        repos: {
          ...state.repos,
          [activeRepoId]: updatedSlice,
        },
      };
    });
  },

  closeInteractiveRebase: () => {
    const activeRepoId = get().activeRepoId;
    if (!activeRepoId) return;
    set((state) => {
      const updatedSlice = {
        ...state.repos[activeRepoId],
        interactiveRebaseModal: null,
      };
      return {
        interactiveRebaseModal: null,
        repos: {
          ...state.repos,
          [activeRepoId]: updatedSlice,
        },
      };
    });
  },

  setUndoToast: (undoToast) => set({ undoToast }),
  dismissUndoToast: () => set({ undoToast: null }),

  triggerUndo: async () => {
    const activeSlice = get().getActiveSlice();
    if (!activeSlice || !activeSlice.repo) return false;
    try {
      const snapshot = await git.undoLastAction(activeSlice.repo.id);
      set({ undoToast: { message: `Undid: ${snapshot.description}`, undone: true } });
      await get().refresh(activeSlice.repo.id);
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  openRepoViaPicker: async () => {
    const path = await git.pickRepositoryFolder();
    if (!path) return false;
    return get().openRepo(path);
  },

  openRepo: async (path) => {
    set({ loading: true, error: null });
    try {
      const repo = await git.openRepo(path);
      const existingSlice = get().repos[repo.id];
      const slice = existingSlice || createEmptyRepoSlice(repo);

      const updatedSlice = {
        ...slice,
        repo,
      };

      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: updatedSlice,
        },
        activeRepoId: repo.id,
      }));

      get().syncActiveTopLevel(repo.id);

      await get().loadRecentRepos();
      await get().refresh(repo.id);
      return true;
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  closeRepo: async (targetRepoId = get().activeRepoId) => {
    if (!targetRepoId) return;
    await git.closeRepo(targetRepoId).catch(() => {});

    const remainingRepos = { ...get().repos };
    delete remainingRepos[targetRepoId];

    const openIds = Object.keys(remainingRepos);
    const nextActiveId =
      get().activeRepoId === targetRepoId
        ? openIds.length > 0
          ? openIds[0]
          : null
        : get().activeRepoId;

    set({
      repos: remainingRepos,
      activeRepoId: nextActiveId,
    });

    get().syncActiveTopLevel(nextActiveId);
  },

  forgetRecentRepo: async (idOrPath) => {
    try {
      await git.forgetRecentRepo(idOrPath);
      await get().loadRecentRepos();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  initSubmodule: async (submodulePath) => {
    const activeSlice = get().getActiveSlice();
    if (!activeSlice || !activeSlice.repo) return false;
    return get().run(async () => {
      await git.initSubmodule(activeSlice.repo.path, submodulePath);
    });
  },

  updateSubmodule: async (submodulePath) => {
    const activeSlice = get().getActiveSlice();
    if (!activeSlice || !activeSlice.repo) return false;
    return get().run(async () => {
      await git.updateSubmodule(activeSlice.repo.path, submodulePath);
    });
  },

  refresh: async (targetRepoId = get().activeRepoId) => {
    if (!targetRepoId) return;
    const targetSlice = get().repos[targetRepoId];
    if (!targetSlice || !targetSlice.repo) return;

    const repoPath = targetSlice.repo.path;

    try {
      const [status, graph, branches, remotes, stashes, submodules, operationState] =
        await Promise.all([
          git.getStatus(repoPath),
          git.getCommitGraph(repoPath),
          git.getBranches(repoPath),
          git.getRemotes(repoPath),
          git.getStashes(repoPath),
          git.getSubmodules(repoPath).catch(() => []),
          git.getRepoOperationState(targetRepoId).catch(() => ({
            kind: null,
            headName: null,
            onto: null,
            conflictedPaths: [],
          })),
        ]);

      if (!get().repos[targetRepoId]) return;

      const updatedSlice = {
        ...get().repos[targetRepoId],
        status,
        commits: graph.commits,
        layout: graph.layout,
        branches,
        remotes,
        stashes,
        submodules,
        operationState,
      };

      set((state) => ({
        repos: {
          ...state.repos,
          [targetRepoId]: updatedSlice,
        },
        error: null,
      }));

      if (get().activeRepoId === targetRepoId) {
        get().syncActiveTopLevel(targetRepoId);
      }
    } catch (error) {
      if (get().repos[targetRepoId]) {
        set({ error: String(error) });
      }
    }
  },

  run: async (operation, targetRepoId = get().activeRepoId) => {
    if (!targetRepoId) return false;
    const targetSlice = get().repos[targetRepoId];
    if (!targetSlice || !targetSlice.repo) return false;

    set({ busy: true, error: null });
    try {
      await operation(targetSlice.repo.path);
      if (get().repos[targetRepoId]) {
        await get().refresh(targetRepoId);
      }
      return true;
    } catch (error) {
      if (get().repos[targetRepoId]) {
        set({ error: String(error) });
      }
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));

/**
 * Wires store to the Rust watcher and MCP mutation events.
 */
export async function subscribeToRepoChanges() {
  const unlistenWatcher = await git.onRepoChanged((event) => {
    const payload = event?.payload;
    if (payload?.repo_id) {
      useRepoStore.getState().refresh(payload.repo_id);
    } else {
      useRepoStore.getState().refresh();
    }
  });

  const unlistenMcp = await git.onMcpEvent((event) => {
    const payload = event?.payload;
    if (payload?.toast) {
      useRepoStore.getState().showUndoToast(payload.toast, payload.tool || "mcp", false);
    }
    useRepoStore.getState().refresh();
  });

  return () => {
    unlistenWatcher();
    unlistenMcp();
  };
}
