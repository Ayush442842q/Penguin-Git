import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GitHubPanel from "./GitHubPanel";
import * as tauriBridge from "../../services/tauriBridge";
import { useRepoStore } from "../../store/repoStore";

vi.mock("../../services/tauriBridge", () => ({
  getGithubToken: vi.fn(),
  saveGithubToken: vi.fn(),
  deleteGithubToken: vi.fn(),
  testGithubConnection: vi.fn(),
  getRepoOrigin: vi.fn(),
}));

describe("GitHubPanel Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({
      activeRepoId: "r1",
      repos: {
        r1: {
          repo: { id: "r1", path: "/path/to/repo", name: "repo" },
        },
      },
    });
    tauriBridge.getGithubToken.mockResolvedValue(true);
    tauriBridge.getRepoOrigin.mockResolvedValue({
      owner: "Ayush442842q",
      repo: "PenguinGit",
    });
  });

  it("renders GitHub Integration header and token status", async () => {
    render(<GitHubPanel />);
    await waitFor(() => {
      expect(screen.getByText("GitHub Integration Settings")).toBeInTheDocument();
      expect(screen.getByText("✓ Saved in Keychain")).toBeInTheDocument();
      expect(screen.getByText("Ayush442842q")).toBeInTheDocument();
    });
  });

  it("handles test connection button click", async () => {
    tauriBridge.testGithubConnection.mockResolvedValue("Ayush442842q");
    render(<GitHubPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(tauriBridge.testGithubConnection).toHaveBeenCalled();
      expect(
        screen.getByText(/✓ Connection successful! Authenticated as @Ayush442842q/)
      ).toBeInTheDocument();
    });
  });

  it("saves PAT on submit", async () => {
    tauriBridge.saveGithubToken.mockResolvedValue();
    render(<GitHubPanel />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Token saved in Keychain/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Token saved in Keychain/);
    fireEvent.change(input, { target: { value: "ghp_test_token_123" } });

    const saveBtn = screen.getByText("Save PAT");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(tauriBridge.saveGithubToken).toHaveBeenCalledWith("ghp_test_token_123");
      expect(screen.getByText(/✓ GitHub PAT saved to keychain!/)).toBeInTheDocument();
    });
  });
});
