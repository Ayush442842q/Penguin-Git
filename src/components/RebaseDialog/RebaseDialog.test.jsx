import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { RebaseDialog } from "./RebaseDialog";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";

vi.mock("../../services/tauriBridge", () => ({
  interactiveRebase: vi.fn(),
}));

describe("RebaseDialog Component", () => {
  const initialCommits = [
    { hash: "abc1234", subject: "Commit 1" },
    { hash: "def5678", subject: "Commit 2" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({
      repo: { id: "/mock/repo", path: "/mock/repo" },
    });
  });

  it("renders list of commits with action selectors", () => {
    render(<RebaseDialog baseRef="main" initialCommits={initialCommits} />);

    expect(screen.getByText("Interactive Rebase onto main")).toBeInTheDocument();
    expect(screen.getAllByTestId("rebase-item")).toHaveLength(2);
    expect(screen.getByDisplayValue("Commit 1")).toBeInTheDocument();
  });

  it("invokes interactiveRebase with correct todo payload", async () => {
    git.interactiveRebase.mockResolvedValue("rebased");

    render(<RebaseDialog baseRef="main" initialCommits={initialCommits} />);

    // Change action of first commit to squash
    const select = screen.getByTestId("action-select-1");
    fireEvent.change(select, { target: { value: "squash" } });

    const startBtn = screen.getByTestId("start-rebase-btn");
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(git.interactiveRebase).toHaveBeenCalledWith("/mock/repo", "main", [
        { action: "pick", hash: "abc1234", message: "Commit 1" },
        { action: "squash", hash: "def5678", message: "Commit 2" },
      ]);
    });
  });
});
