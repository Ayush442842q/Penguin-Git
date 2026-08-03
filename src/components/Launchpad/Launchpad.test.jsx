import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import Launchpad from "./Launchpad";
import * as tauriBridge from "../../services/tauriBridge";
import { useRepoStore } from "../../store/repoStore";

vi.mock("../../services/tauriBridge", () => ({
  getGithubToken: vi.fn(),
  getRepoOrigin: vi.fn(),
  githubGetLaunchpadItems: vi.fn(),
  githubCreatePr: vi.fn(),
  startWorkOnIssue: vi.fn(),
  getBranches: vi.fn(),
}));

describe("Launchpad Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({
      activeRepoId: "r1",
      repos: {
        r1: {
          repo: { id: "r1", path: "/path/to/repo", name: "repo" },
          status: { branch: "main" },
        },
      },
      loadRepo: vi.fn().mockResolvedValue(),
    });
    tauriBridge.getGithubToken.mockResolvedValue(true);
    tauriBridge.getRepoOrigin.mockResolvedValue({ owner: "Ayush442842q", repo: "PenguinGit" });
    tauriBridge.githubGetLaunchpadItems.mockResolvedValue([
      {
        kind: "pr",
        title: "Review PR",
        number: 10,
        repo: "Ayush442842q/PenguinGit",
        url: "https://github.com/Ayush442842q/PenguinGit/pull/10",
        category: "Needs review",
        updated_at: "2026-08-02T10:00:00Z",
        author: "alice",
        state: "open",
      },
      {
        kind: "pr",
        title: "My Feature PR",
        number: 11,
        repo: "Ayush442842q/PenguinGit",
        url: "https://github.com/Ayush442842q/PenguinGit/pull/11",
        category: "Your PRs",
        updated_at: "2026-08-02T11:00:00Z",
        author: "bob",
        state: "open",
      },
      {
        kind: "pr",
        title: "Approved PR",
        number: 12,
        repo: "Ayush442842q/PenguinGit",
        url: "https://github.com/Ayush442842q/PenguinGit/pull/12",
        category: "Ready to merge",
        updated_at: "2026-08-02T12:00:00Z",
        author: "bob",
        state: "open",
      },
      {
        kind: "issue",
        title: "Fix login crash",
        number: 123,
        repo: "Ayush442842q/PenguinGit",
        url: "https://github.com/Ayush442842q/PenguinGit/issues/123",
        category: "Issues",
        updated_at: "2026-08-02T13:00:00Z",
        author: "charlie",
        state: "open",
      },
    ]);
  });

  it("renders Launchpad header and items grouped by categories", async () => {
    render(
      <MemoryRouter>
        <Launchpad isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("🚀 Launchpad")).toBeInTheDocument();
      expect(screen.getByText("Review PR")).toBeInTheDocument();
      expect(screen.getByText("My Feature PR")).toBeInTheDocument();
      expect(screen.getByText("Approved PR")).toBeInTheDocument();
      expect(screen.getByText("Fix login crash")).toBeInTheDocument();
    });
  });

  it("displays warning banner when PAT is missing", async () => {
    tauriBridge.getGithubToken.mockResolvedValue(false);

    render(
      <MemoryRouter>
        <Launchpad isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/GitHub Personal Access Token is required/)).toBeInTheDocument();
    });
  });

  it("clicks Start Work on Issue and invokes startWorkOnIssue", async () => {
    tauriBridge.startWorkOnIssue.mockResolvedValue("123-fix-login-crash");

    render(
      <MemoryRouter>
        <Launchpad isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("🚀 Start Work on Issue")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("🚀 Start Work on Issue"));

    await waitFor(() => {
      expect(tauriBridge.startWorkOnIssue).toHaveBeenCalledWith(
        "/path/to/repo",
        123,
        "Fix login crash"
      );
      expect(
        screen.getByText(/Created & checked out branch "123-fix-login-crash"/)
      ).toBeInTheDocument();
    });
  });
});
