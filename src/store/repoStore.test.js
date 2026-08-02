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
}

/** Opens REPO with every refresh call stubbed, leaving the store in a normal state. */
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
      repo: null,
      status: null,
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
    });
  });

  // -- Opening and closing --------------------------------------------------

  it("records opened repositories as recent, most recent first and without duplicates", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);

    await useRepoStore.getState().openRepo("/repo");
    git.openRepo.mockResolvedValue(OTHER);
    await useRepoStore.getState().openRepo("/other");
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");

    expect(useRepoStore.getState().recentRepos).toEqual(["/repo", "/other"]);
  });

  it("caps the recent list rather than growing it forever", async () => {
    stubRefreshCalls();
    for (let i = 0; i < 14; i += 1) {
      git.openRepo.mockResolvedValue({ ...REPO, id: `/r${i}`, path: `/r${i}` });
      await useRepoStore.getState().openRepo(`/r${i}`);
    }

    const { recentRepos } = useRepoStore.getState();
    expect(recentRepos).toHaveLength(10);
    expect(recentRepos[0]).toBe("/r13");
    expect(recentRepos).not.toContain("/r0");
  });

  it("persists the recent list so it survives a restart", async () => {
    await openFixtureRepo();

    expect(JSON.parse(localStorage.getItem("penguingit.recentRepos"))).toEqual(["/repo"]);
  });

  it("reads the recent list back on load and shrugs off corrupt storage", async () => {
    localStorage.setItem("penguingit.recentRepos", JSON.stringify(["/a", "/b"]));
    vi.resetModules();
    const fresh = await import("./repoStore");
    expect(fresh.useRepoStore.getState().recentRepos).toEqual(["/a", "/b"]);

    // Hand-edited or truncated storage must not stop the app booting.
    localStorage.setItem("penguingit.recentRepos", "{not json");
    vi.resetModules();
    const recovered = await import("./repoStore");
    expect(recovered.useRepoStore.getState().recentRepos).toEqual([]);
  });

  it("forgets a single recent repo without touching the others", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");
    git.openRepo.mockResolvedValue(OTHER);
    await useRepoStore.getState().openRepo("/other");

    useRepoStore.getState().forgetRecentRepo("/repo");

    expect(useRepoStore.getState().recentRepos).toEqual(["/other"]);
    expect(JSON.parse(localStorage.getItem("penguingit.recentRepos"))).toEqual(["/other"]);
  });

  it("still opens a repository when localStorage is unavailable", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const ok = await useRepoStore.getState().openRepo("/repo");

    expect(ok).toBe(true);
    expect(useRepoStore.getState().repo?.id).toBe(REPO.id);
    setItem.mockRestore();
  });

  it("surfaces an open failure as an error instead of a half-open repo", async () => {
    git.openRepo.mockRejectedValue("not a git repository");

    const ok = await useRepoStore.getState().openRepo("/not-a-repo");

    expect(ok).toBe(false);
    expect(useRepoStore.getState().repo).toBeNull();
    expect(useRepoStore.getState().error).toContain("not a git repository");
  });

  it("keeps the current repo open when opening a different one fails", async () => {
    await openFixtureRepo();
    expect(useRepoStore.getState().repo).not.toBeNull();

    git.openRepo.mockRejectedValue("not a git repository");
    const ok = await useRepoStore.getState().openRepo("/somewhere-else");

    expect(ok).toBe(false);
    // A typo in a different path must not close the repository being worked on.
    expect(useRepoStore.getState().repo?.id).toBe(REPO.id);
    expect(useRepoStore.getState().error).toContain("not a git repository");
  });

  it("clears the loading flag whether the open succeeds or fails", async () => {
    await openFixtureRepo();
    expect(useRepoStore.getState().loading).toBe(false);

    git.openRepo.mockRejectedValue("boom");
    await useRepoStore.getState().openRepo("/nope");
    expect(useRepoStore.getState().loading).toBe(false);
  });

  it("drops the previous selection when a new repo is opened", async () => {
    await openFixtureRepo();
    useRepoStore.getState().selectCommit({ hash: "abc" });
    useRepoStore.getState().selectFile({ path: "a.txt" });

    git.openRepo.mockResolvedValue(OTHER);
    await useRepoStore.getState().openRepo("/other");

    // A commit hash from the old repository means nothing in the new one.
    expect(useRepoStore.getState().selectedCommit).toBeNull();
    expect(useRepoStore.getState().selectedFile).toBeNull();
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

  it("clears every repo-scoped slice on close", async () => {
    await openFixtureRepo();
    useRepoStore.setState({
      commits: [{ hash: "abc" }],
      branches: [{ name: "main" }],
      remotes: [{ name: "origin" }],
      stashes: [{ index: 0 }],
      selectedCommit: { hash: "abc" },
      selectedFile: { path: "a.txt" },
    });

    await useRepoStore.getState().closeRepo();

    const state = useRepoStore.getState();
    expect(git.closeRepo).toHaveBeenCalledWith(REPO.id);
    expect(state.repo).toBeNull();
    expect(state.status).toBeNull();
    expect(state.commits).toEqual([]);
    expect(state.branches).toEqual([]);
    expect(state.remotes).toEqual([]);
    expect(state.stashes).toEqual([]);
    expect(state.selectedCommit).toBeNull();
    expect(state.selectedFile).toBeNull();
    // Recents are the point of recents — closing must not wipe them.
    expect(state.recentRepos).toEqual(["/repo"]);
  });

  it("closes locally even if the backend refuses", async () => {
    await openFixtureRepo();
    git.closeRepo.mockRejectedValue("already gone");

    await useRepoStore.getState().closeRepo();

    expect(useRepoStore.getState().repo).toBeNull();
  });

  // -- Refresh ---------------------------------------------------------------

  it("refreshing with no repo open is a no-op", async () => {
    await useRepoStore.getState().refresh();

    expect(git.getStatus).not.toHaveBeenCalled();
  });

  it("populates every slice from one refresh", async () => {
    await openFixtureRepo();

    const status = { ...EMPTY_STATUS, ahead: 2 };
    const graph = {
      commits: [{ hash: "abc", subject: "Work" }],
      layout: { rows: [{ hash: "abc", lane: 0 }], laneCount: 1 },
    };
    git.getStatus.mockResolvedValue(status);
    git.getCommitGraph.mockResolvedValue(graph);
    git.getBranches.mockResolvedValue([{ name: "main" }]);
    git.getRemotes.mockResolvedValue([{ name: "origin" }]);
    git.getStashes.mockResolvedValue([{ index: 0, hash: "s1" }]);

    await useRepoStore.getState().refresh();

    const state = useRepoStore.getState();
    expect(state.status).toEqual(status);
    expect(state.commits).toEqual(graph.commits);
    expect(state.layout).toEqual(graph.layout);
    expect(state.branches).toEqual([{ name: "main" }]);
    expect(state.remotes).toEqual([{ name: "origin" }]);
    expect(state.stashes).toEqual([{ index: 0, hash: "s1" }]);
  });

  it("fetches the five views in parallel rather than in a chain", async () => {
    await openFixtureRepo();

    // Each call records how many of the five had started when it was invoked.
    const startedWhenCalled = [];
    let started = 0;
    for (const fn of [
      git.getStatus,
      git.getCommitGraph,
      git.getBranches,
      git.getRemotes,
      git.getStashes,
    ]) {
      fn.mockImplementation(() => {
        started += 1;
        startedWhenCalled.push(started);
        return Promise.resolve(fn === git.getCommitGraph ? { commits: [], layout: {} } : []);
      });
    }

    await useRepoStore.getState().refresh();

    // Serial execution would await each before starting the next; parallel means
    // all five are in flight before any resolves.
    expect(startedWhenCalled).toEqual([1, 2, 3, 4, 5]);
  });

  it("clears a stale error once a refresh succeeds", async () => {
    await openFixtureRepo();
    useRepoStore.setState({ error: "something went wrong earlier" });

    await useRepoStore.getState().refresh();

    expect(useRepoStore.getState().error).toBeNull();
  });

  it("reports a refresh failure without blanking the last good data", async () => {
    await openFixtureRepo();
    useRepoStore.setState({ commits: [{ hash: "abc" }] });
    git.getStatus.mockRejectedValue("git exploded");

    await useRepoStore.getState().refresh();

    expect(useRepoStore.getState().error).toContain("git exploded");
    expect(useRepoStore.getState().commits).toEqual([{ hash: "abc" }]);
  });

  it("discards a refresh that resolves after the repo was switched", async () => {
    await openFixtureRepo();

    // A slow status call for the first repo, resolving after the switch.
    let releaseSlowFetch;
    git.getStatus.mockImplementationOnce(
      () =>
        new Promise(
          (resolve) => (releaseSlowFetch = () => resolve({ ...EMPTY_STATUS, branch: "stale" }))
        )
    );
    git.getCommitGraph.mockResolvedValue({
      commits: [{ hash: "stale-commit" }],
      layout: { rows: [], laneCount: 0 },
    });

    const pending = useRepoStore.getState().refresh();

    // User switches repositories while that request is still in flight.
    useRepoStore.setState({ repo: OTHER });
    releaseSlowFetch();
    await pending;

    // The stale response must not paint over the newly-opened repository.
    expect(useRepoStore.getState().status?.branch).not.toBe("stale");
    expect(useRepoStore.getState().commits).not.toContainEqual({ hash: "stale-commit" });
  });

  it("discards a refresh *failure* that lands after the repo was switched", async () => {
    await openFixtureRepo();

    let rejectSlowFetch;
    git.getStatus.mockImplementationOnce(
      () => new Promise((_, reject) => (rejectSlowFetch = () => reject("old repo is gone")))
    );

    const pending = useRepoStore.getState().refresh();
    useRepoStore.setState({ repo: OTHER });
    rejectSlowFetch();
    await pending;

    // Showing the old repository's error against the new one is just confusing.
    expect(useRepoStore.getState().error).toBeNull();
  });

  it("refreshes when the Rust watcher reports a change", async () => {
    await openFixtureRepo();

    // Capture the handler the store registers for the repo-changed event.
    let handler;
    git.onRepoChanged.mockImplementation((fn) => {
      handler = fn;
      return Promise.resolve(() => {});
    });
    await subscribeToRepoChanges();

    const before = git.getStatus.mock.calls.length;
    handler();
    await vi.waitFor(() => {
      expect(git.getStatus.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it("hands back the watcher's unlisten function so the subscription can be torn down", async () => {
    const unlisten = vi.fn();
    git.onRepoChanged.mockResolvedValue(unlisten);

    const returned = await subscribeToRepoChanges();

    expect(returned).toBe(unlisten);
  });

  // -- Mutating operations ---------------------------------------------------

  it("refuses to run an operation with no repo open", async () => {
    const operation = vi.fn();

    const ok = await useRepoStore.getState().run(operation);

    expect(ok).toBe(false);
    expect(operation).not.toHaveBeenCalled();
  });

  it("passes the repo path to the operation and refreshes afterwards", async () => {
    await openFixtureRepo();
    const before = git.getStatus.mock.calls.length;
    const operation = vi.fn(() => Promise.resolve());

    const ok = await useRepoStore.getState().run(operation);

    expect(ok).toBe(true);
    expect(operation).toHaveBeenCalledWith("/repo");
    expect(git.getStatus.mock.calls.length).toBeGreaterThan(before);
  });

  it("marks the store busy while an operation is in flight", async () => {
    await openFixtureRepo();
    let release;
    const pending = useRepoStore
      .getState()
      .run(() => new Promise((resolve) => (release = resolve)));

    // The UI disables double-clickable buttons off this flag.
    expect(useRepoStore.getState().busy).toBe(true);
    release();
    await pending;
    expect(useRepoStore.getState().busy).toBe(false);
  });

  it("clears a previous error when a new operation starts", async () => {
    await openFixtureRepo();
    useRepoStore.setState({ error: "the last push failed" });

    await useRepoStore.getState().run(() => Promise.resolve());

    expect(useRepoStore.getState().error).toBeNull();
  });

  it("reports a failed operation without leaving the store stuck busy", async () => {
    await openFixtureRepo();

    const ok = await useRepoStore.getState().run(() => Promise.reject("push rejected"));

    expect(ok).toBe(false);
    expect(useRepoStore.getState().busy).toBe(false);
    expect(useRepoStore.getState().error).toContain("push rejected");
  });

  it("does not refresh a repository the user has already switched away from", async () => {
    await openFixtureRepo();

    const before = git.getStatus.mock.calls.length;
    const ok = await useRepoStore.getState().run(async () => {
      useRepoStore.setState({ repo: OTHER });
    });

    expect(ok).toBe(false);
    expect(git.getStatus.mock.calls.length).toBe(before);
  });

  it("does not report an operation failure against a repo that is no longer open", async () => {
    await openFixtureRepo();

    await useRepoStore.getState().run(async () => {
      useRepoStore.setState({ repo: OTHER });
      throw new Error("stale failure");
    });

    expect(useRepoStore.getState().error).toBeNull();
  });

  // -- Selection and errors --------------------------------------------------

  it("selecting a commit clears the file selected within the previous one", () => {
    useRepoStore.getState().selectFile({ path: "a.txt" });

    useRepoStore.getState().selectCommit({ hash: "abc" });

    expect(useRepoStore.getState().selectedCommit).toEqual({ hash: "abc" });
    expect(useRepoStore.getState().selectedFile).toBeNull();
  });

  it("selecting a file leaves the selected commit alone", () => {
    useRepoStore.getState().selectCommit({ hash: "abc" });

    useRepoStore.getState().selectFile({ path: "a.txt" });

    expect(useRepoStore.getState().selectedCommit).toEqual({ hash: "abc" });
    expect(useRepoStore.getState().selectedFile).toEqual({ path: "a.txt" });
  });

  it("errors can be set and dismissed", () => {
    useRepoStore.getState().setError("something broke");
    expect(useRepoStore.getState().error).toBe("something broke");

    useRepoStore.getState().clearError();
    expect(useRepoStore.getState().error).toBeNull();
  });
});
