import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictEditor } from "./ConflictEditor";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";

vi.mock("../../services/tauriBridge", () => ({
  readConflictStages: vi.fn(),
  resolveConflict: vi.fn(),
  continueOperation: vi.fn(),
  abortOperation: vi.fn(),
  skipRebase: vi.fn(),
}));

describe("ConflictEditor Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({
      repo: { id: "/mock/repo", path: "/mock/repo" },
      operationState: {
        kind: "merge",
        headName: "feature",
        onto: null,
        conflictedPaths: ["file.txt"],
      },
    });

    git.readConflictStages.mockResolvedValue({
      path: "file.txt",
      base: "base text",
      ours: "ours text",
      theirs: "theirs text",
      hasBase: true,
      hasOurs: true,
      hasTheirs: true,
    });
  });

  it("renders 4 panes (Base, Ours, Theirs, Resolved)", async () => {
    render(<ConflictEditor path="file.txt" />);

    expect(screen.getByText("Ours (Current)")).toBeInTheDocument();
    expect(screen.getByText("Base (Ancestor)")).toBeInTheDocument();
    expect(screen.getByText("Theirs (Incoming)")).toBeInTheDocument();
    expect(screen.getByText("Resolved Result")).toBeInTheDocument();

    await waitFor(() => {
      expect(git.readConflictStages).toHaveBeenCalledWith("/mock/repo", "file.txt");
    });
  });

  it("disables Continue button when conflicts remain", () => {
    render(<ConflictEditor path="file.txt" />);
    const continueBtn = screen.getByTestId("continue-btn");
    expect(continueBtn).toBeDisabled();
  });

  it("enables Continue button when zero conflicts remain", () => {
    useRepoStore.setState({
      operationState: {
        kind: "merge",
        headName: "feature",
        onto: null,
        conflictedPaths: [],
      },
    });

    render(<ConflictEditor />);
    const continueBtn = screen.getByTestId("continue-btn");
    expect(continueBtn).not.toBeDisabled();
  });

  it("calls resolveConflict on Save & Stage click", async () => {
    git.resolveConflict.mockResolvedValue();

    render(<ConflictEditor path="file.txt" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("ours text")).toBeInTheDocument();
    });

    const saveBtn = screen.getByTestId("save-resolution-btn");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(git.resolveConflict).toHaveBeenCalledWith("/mock/repo", "file.txt", "ours text");
    });
  });
});
