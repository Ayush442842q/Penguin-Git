import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tauri's IPC layer doesn't exist in jsdom, so the bridge is mocked wholesale.
// Mocking our own module rather than `@tauri-apps/*` keeps the test coupled to
// the interface the components actually use.
vi.mock("./services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("./test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "./services/tauriBridge";
import App from "./App";
import { useRepoStore } from "./store/repoStore";

const REPO = { id: "/repo", path: "/home/dev/projects/my-repo", name: "my-repo" };

const CLEAN_STATUS = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
};

function resetStore() {
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
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetStore();
  });

  it("renders the welcome screen when no repository is open", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /penguingit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open repository/i })).toBeInTheDocument();
  });

  it("lists recent repositories so they can be reopened", () => {
    useRepoStore.setState({ recentRepos: ["/home/dev/projects/my-repo"] });

    render(<App />);

    expect(screen.getByTitle("/home/dev/projects/my-repo")).toBeInTheDocument();
    expect(screen.getByText("my-repo")).toBeInTheDocument();
  });

  it("does not show a recent list when there is none", () => {
    render(<App />);

    expect(screen.queryByText(/recent/i)).not.toBeInTheDocument();
  });

  it("opens the folder picker when the welcome button is clicked", () => {
    bridge.pickRepositoryFolder.mockResolvedValue(null);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open repository/i }));

    expect(bridge.pickRepositoryFolder).toHaveBeenCalled();
  });

  it("opens a recent repository by clicking its entry", async () => {
    useRepoStore.setState({ recentRepos: ["/home/dev/projects/my-repo"] });
    bridge.openRepo.mockResolvedValue(REPO);
    bridge.getStatus.mockResolvedValue(CLEAN_STATUS);
    bridge.getCommitGraph.mockResolvedValue({ commits: [], layout: { rows: [], laneCount: 0 } });
    bridge.getBranches.mockResolvedValue([]);
    bridge.getRemotes.mockResolvedValue([]);
    bridge.getStashes.mockResolvedValue([]);

    render(<App />);
    fireEvent.click(screen.getByText("my-repo"));

    expect(bridge.openRepo).toHaveBeenCalledWith("/home/dev/projects/my-repo");
    // Let the refresh chain settle so it can't leak a stray update into a later test.
    await vi.waitFor(() => expect(useRepoStore.getState().repo).toEqual(REPO));
  });

  it("forgets a recent repository without opening it", () => {
    useRepoStore.setState({ recentRepos: ["/home/dev/projects/my-repo"] });

    render(<App />);
    fireEvent.click(screen.getByTitle("Remove from recent"));

    expect(bridge.openRepo).not.toHaveBeenCalled();
    expect(useRepoStore.getState().recentRepos).toEqual([]);
  });

  it("disables the welcome button while a repo is opening", () => {
    useRepoStore.setState({ loading: true });

    render(<App />);

    expect(screen.getByRole("button", { name: /open repository/i })).toBeDisabled();
  });

  // -- Once a repository is open --------------------------------------------

  function renderWithOpenRepo(overrides = {}) {
    useRepoStore.setState({
      repo: REPO,
      status: CLEAN_STATUS,
      commits: [],
      layout: { rows: [], laneCount: 0 },
      branches: [],
      remotes: [],
      stashes: [],
      ...overrides,
    });
    return render(<App />);
  }

  it("shows the app shell instead of the welcome screen once a repo is open", () => {
    renderWithOpenRepo();

    expect(screen.queryByRole("heading", { name: /penguingit/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("my-repo").length).toBeGreaterThan(0);
  });

  it("shows the current branch as a badge in the header", () => {
    renderWithOpenRepo({ status: { ...CLEAN_STATUS, branch: "feature/login" } });

    expect(screen.getByText("feature/login")).toBeInTheDocument();
  });

  it("shows a working indicator while a mutating operation is in flight", () => {
    renderWithOpenRepo({ busy: true });

    expect(screen.getByText(/working…/i)).toBeInTheDocument();
  });

  it("disables open and close while busy, so a switch cannot race a running operation", () => {
    renderWithOpenRepo({ busy: true });

    expect(screen.getByRole("button", { name: "Open…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("closes the repository from the header", () => {
    bridge.closeRepo.mockResolvedValue(undefined);
    renderWithOpenRepo();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(bridge.closeRepo).toHaveBeenCalledWith(REPO.id);
  });

  it("reports a clean working tree in the status bar", () => {
    renderWithOpenRepo({ status: CLEAN_STATUS, commits: [{ hash: "a" }, { hash: "b" }] });

    expect(screen.getByText("2 commits")).toBeInTheDocument();
    expect(screen.getByText("working tree clean")).toBeInTheDocument();
  });

  it("counts staged, unstaged, and untracked files together as changes", () => {
    renderWithOpenRepo({
      status: {
        ...CLEAN_STATUS,
        staged: [{ path: "a" }],
        unstaged: [{ path: "b" }, { path: "c" }],
        untracked: [{ path: "d" }],
      },
    });

    expect(screen.getByText("4 changed")).toBeInTheDocument();
  });

  it("shows upstream divergence when an upstream is configured", () => {
    renderWithOpenRepo({
      status: { ...CLEAN_STATUS, upstream: "origin/main", ahead: 2, behind: 1 },
    });

    expect(screen.getByText(/origin\/main/)).toBeInTheDocument();
    expect(screen.getByText(/↑2/)).toBeInTheDocument();
    expect(screen.getByText(/↓1/)).toBeInTheDocument();
  });

  it("hides the divergence line when there is no upstream", () => {
    renderWithOpenRepo({ status: { ...CLEAN_STATUS, upstream: null } });

    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
  });

  it("shows an error in the status bar instead of the normal summary", () => {
    renderWithOpenRepo({ error: "push rejected: non-fast-forward" });

    expect(screen.getByText(/push rejected/)).toBeInTheDocument();
    expect(screen.queryByText("working tree clean")).not.toBeInTheDocument();
  });

  it("dismisses the error by clicking the status bar", () => {
    renderWithOpenRepo({ error: "push rejected" });

    fireEvent.click(screen.getByText(/push rejected/));

    expect(useRepoStore.getState().error).toBeNull();
  });
});
