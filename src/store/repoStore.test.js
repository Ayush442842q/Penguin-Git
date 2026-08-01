import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tauriBridge", () => ({
  REPO_CHANGED_EVENT: "repo-changed",
  DEFAULT_LOG_LIMIT: 500,
  onRepoChanged: vi.fn(),
  openRepo: vi.fn(),
  closeRepo: vi.fn(),
  pickRepositoryFolder: vi.fn(),
  getStatus: vi.fn(),
  getCommitGraph: vi.fn(),
  getBranches: vi.fn(),
  getRemotes: vi.fn(),
  getStashes: vi.fn(),
}));

import * as git from "../services/tauriBridge";
import { useRepoStore, subscribeToRepoChanges } from "./repoStore";

const REPO = { id: "/repo", path: "/repo", name: "repo", headBranch: "main" };

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
      error: null,
      busy: false,
    });
  });

  it("records opened repositories as recent, most recent first and without duplicates", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);

    await useRepoStore.getState().openRepo("/repo");
    const other = { ...REPO, id: "/other", path: "/other", name: "other" };
    git.openRepo.mockResolvedValue(other);
    await useRepoStore.getState().openRepo("/other");
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");

    expect(useRepoStore.getState().recentRepos).toEqual(["/repo", "/other"]);
  });

  it("surfaces an open failure as an error instead of a half-open repo", async () => {
    git.openRepo.mockRejectedValue("not a git repository");

    const ok = await useRepoStore.getState().openRepo("/not-a-repo");

    expect(ok).toBe(false);
    expect(useRepoStore.getState().repo).toBeNull();
    expect(useRepoStore.getState().error).toContain("not a git repository");
  });

  it("refreshes when the Rust watcher reports a change", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");

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

  it("keeps the current repo open when opening a different one fails", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");
    expect(useRepoStore.getState().repo).not.toBeNull();

    git.openRepo.mockRejectedValue("not a git repository");
    const ok = await useRepoStore.getState().openRepo("/somewhere-else");

    expect(ok).toBe(false);
    // A typo in a different path must not close the repository being worked on.
    expect(useRepoStore.getState().repo?.id).toBe(REPO.id);
    expect(useRepoStore.getState().error).toContain("not a git repository");
  });

  it("discards a refresh that resolves after the repo was switched", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");

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
    useRepoStore.setState({ repo: { ...REPO, id: "/other", path: "/other", name: "other" } });
    releaseSlowFetch();
    await pending;

    // The stale response must not paint over the newly-opened repository.
    expect(useRepoStore.getState().status?.branch).not.toBe("stale");
    expect(useRepoStore.getState().commits).not.toContainEqual({ hash: "stale-commit" });
  });

  it("reports a failed operation without leaving the store stuck busy", async () => {
    stubRefreshCalls();
    git.openRepo.mockResolvedValue(REPO);
    await useRepoStore.getState().openRepo("/repo");

    const ok = await useRepoStore.getState().run(() => Promise.reject("push rejected"));

    expect(ok).toBe(false);
    expect(useRepoStore.getState().busy).toBe(false);
    expect(useRepoStore.getState().error).toContain("push rejected");
  });
});
