import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../test/bridgeMock");
  return makeBridgeMock();
});

import * as git from "../services/tauriBridge";
import { useRepoStore, subscribeToRepoChanges } from "./repoStore";

const REPO = { id: "/repo", path: "/repo", name: "repo", headBranch: "main" };
const OTHER = { id: "/other", path: "/other", name: "other", headBranch: "main" };

const EMPTY_STATUS = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
};

function stubRefreshCalls() {
  git.getStatus.mockResolvedValue(EMPTY_STATUS);
  git.getCommitGraph.mockResolvedValue({ commits: [], layout: { rows: [], laneCount: 0 } });
  git.getBranches.mockResolvedValue([]);
  git.getRemotes.mockResolvedValue([]);
  git.getStashes.mockResolvedValue([]);
  git.getSubmodules.mockResolvedValue([]);
  git.listRecentRepos.mockResolvedValue([]);
}

async function openFixtureRepo() {
  stubRefreshCalls();
  git.openRepo.mockResolvedValue(REPO);
  await useRepoStore.getState().openRepo("/repo");
}

describe("repoStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRepoStore.setState({
      repos: {},
      activeRepoId: null,
      recentRepos: [],
      loading: false,
      error: null,
      busy: false,
      undoToast: null,
    });
  });

  // -- Opening and closing --------------------------------------------------

  it("records opened repositories in recentRepos", async () => {
    stubRefreshCalls();
    const mockRecent = [
      { id: "/repo", path: "/repo", displayName: "repo", lastOpenedAt: "100", kind: "plain" },
    ];
    git.listRecentRepos.mockResolvedValue(mockRecent);
    git.openRepo.mockResolvedValue(REPO);

    await useRepoStore.getState().openRepo("/repo");
    expect(useRepoStore.getState().recentRepos).toEqual(mockRecent);
  });

  it("surfaces an open failure as an error", async () => {
    git.openRepo.mockRejectedValue("not a git repository");

    const ok = await useRepoStore.getState().openRepo("/not-a-repo");

    expect(ok).toBe(false);
    expect(useRepoStore.getState().activeRepoId).toBeNull();
    expect(useRepoStore.getState().error).toContain("not a git repository");
  });

  it("keeps the current active repo open when opening a different one fails", async () => {
    await openFixtureRepo();
    expect(useRepoStore.getState().activeRepoId).toBe(REPO.id);

    git.openRepo.mockRejectedValue("not a git repository");
    const ok = await useRepoStore.getState().openRepo("/somewhere-else");

    expect(ok).toBe(false);
    expect(useRepoStore.getState().activeRepoId).toBe(REPO.id);
    expect(useRepoStore.getState().error).toContain("not a git repository");
  });

  it("clears the loading flag whether open succeeds or fails", async () => {
    await openFixtureRepo();
    expect(useRepoStore.getState().loading).toBe(false);

    git.openRepo.mockRejectedValue("boom");
    await useRepoStore.getState().openRepo("/nope");
    expect(useRepoStore.getState().loading).toBe(false);
  });

  it("opens the repository the folder picker returns", async () => {
    stubRefreshCalls();
    git.pickRepositoryFolder.mockResolvedValue("/picked");
    git.openRepo.mockResolvedValue({ ...REPO, id: "/picked", path: "/picked" });

    const ok = await useRepoStore.getState().openRepoViaPicker();

    expect(ok).toBe(true);
    expect(git.openRepo).toHaveBeenCalledWith("/picked");
  });

  it("does nothing when the folder picker is cancelled", async () => {
    git.pickRepositoryFolder.mockResolvedValue(null);

    const ok = await useRepoStore.getState().openRepoViaPicker();

    expect(ok).toBe(false);
    expect(git.openRepo).not.toHaveBeenCalled();
    expect(useRepoStore.getState().error).toBeNull();
  });

  it("closes target repo and removes it from repos map", async () => {
    await openFixtureRepo();

    await useRepoStore.getState().closeRepo(REPO.id);

    const state = useRepoStore.getState();
    expect(git.closeRepo).toHaveBeenCalledWith(REPO.id);
    expect(state.repos[REPO.id]).toBeUndefined();
    expect(state.activeRepoId).toBeNull();
  });

  // -- Multi-Repo Isolation Check ---------------------------------------------

  it("keeps state strictly isolated between open repositories (zero cross-repo state bleed)", async () => {
    stubRefreshCalls();

    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");

    git.openRepo.mockResolvedValue(OTHER);
    await useRepoStore.getState().openRepo("/other");

    // Stage a file in Repo A (/repo)
    const repoAStatus = { ...EMPTY_STATUS, staged: [{ path: "staged_a.txt", kind: "added" }] };
    const repoBStatus = { ...EMPTY_STATUS, staged: [] };

    git.getStatus.mockImplementation((path) => {
      if (path === "/repo") return Promise.resolve(repoAStatus);
      if (path === "/other") return Promise.resolve(repoBStatus);
      return Promise.resolve(EMPTY_STATUS);
    });

    await useRepoStore.getState().refresh("/repo");
    await useRepoStore.getState().refresh("/other");

    const repos = useRepoStore.getState().repos;

    // Confirm repo A has staged file and repo B is completely unaffected
    expect(repos["/repo"].status.staged).toHaveLength(1);
    expect(repos["/repo"].status.staged[0].path).toBe("staged_a.txt");

    expect(repos["/other"].status.staged).toHaveLength(0);
  });

  it("submodule actions operate on active repo and trigger refresh", async () => {
    await openFixtureRepo();
    git.initSubmodule.mockResolvedValue();
    git.updateSubmodule.mockResolvedValue();

    await useRepoStore.getState().initSubmodule("vendor/lib");
    expect(git.initSubmodule).toHaveBeenCalledWith("/repo", "vendor/lib");

    await useRepoStore.getState().updateSubmodule("vendor/lib");
    expect(git.updateSubmodule).toHaveBeenCalledWith("/repo", "vendor/lib");
  });

  // -- Watcher Integration ----------------------------------------------------

  it("subscribes to repo-changed event and refreshes target repo", async () => {
    let changeHandler;
    git.onRepoChanged.mockImplementation((handler) => {
      changeHandler = handler;
      return Promise.resolve(() => {});
    });

    await subscribeToRepoChanges();
    await openFixtureRepo();

    git.getStatus.mockClear();
    changeHandler({ payload: { repo_id: "/repo" } });

    expect(git.getStatus).toHaveBeenCalledWith("/repo");
  });

  it("triggerUndo and triggerRedo invoke backend git services and set toast state", async () => {
    await openFixtureRepo();

    git.undoLastAction.mockResolvedValue({ description: "Commit feature" });
    git.redoLastAction.mockResolvedValue({ description: "Commit feature" });

    const undoOk = await useRepoStore.getState().triggerUndo();
    expect(undoOk).toBe(true);
    expect(git.undoLastAction).toHaveBeenCalledWith("/repo");
    expect(useRepoStore.getState().undoToast).toEqual({
      message: "Undid: Commit feature",
      undone: true,
    });

    const redoOk = await useRepoStore.getState().triggerRedo();
    expect(redoOk).toBe(true);
    expect(git.redoLastAction).toHaveBeenCalledWith("/repo");
    expect(useRepoStore.getState().undoToast).toEqual({
      message: "Redid: Commit feature",
      undone: false,
      redone: true,
    });
  });
});
