import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tauri's IPC layer doesn't exist in jsdom, so the bridge is mocked wholesale.
// Mocking our own module rather than `@tauri-apps/*` keeps the test coupled to
// the interface the components actually use.
vi.mock("./services/tauriBridge", () => ({
  REPO_CHANGED_EVENT: "repo-changed",
  DEFAULT_LOG_LIMIT: 500,
  pickRepositoryFolder: vi.fn(),
  openRepo: vi.fn(),
  listOpenRepos: vi.fn(),
  closeRepo: vi.fn(),
  onRepoChanged: vi.fn(() => Promise.resolve(() => {})),
  getStatus: vi.fn(),
  getLog: vi.fn(),
  getCommitGraph: vi.fn(),
  getFileDiff: vi.fn(),
  getUntrackedDiff: vi.fn(),
  getCommitDiff: vi.fn(),
  getFileHistory: vi.fn(),
  getBlame: vi.fn(),
  stageFile: vi.fn(),
  stageAll: vi.fn(),
  unstageFile: vi.fn(),
  unstageAll: vi.fn(),
  discardFileChanges: vi.fn(),
  discardUntracked: vi.fn(),
  commitChanges: vi.fn(),
  getCommitMessage: vi.fn(),
  cherryPick: vi.fn(),
  revertCommit: vi.fn(),
  resetToCommit: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getBranches: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  renameBranch: vi.fn(),
  checkout: vi.fn(),
  checkoutNewBranch: vi.fn(),
  mergeBranch: vi.fn(),
  rebaseOnto: vi.fn(),
  getRemotes: vi.fn(),
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  setRemoteUrl: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  getStashes: vi.fn(),
  saveStash: vi.fn(),
  getStashDiff: vi.fn(),
  applyStash: vi.fn(),
  popStash: vi.fn(),
  dropStash: vi.fn(),
}));

import App from "./App";
import { useRepoStore } from "./store/repoStore";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    useRepoStore.setState({ repo: null, recentRepos: [], error: null });
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
});
