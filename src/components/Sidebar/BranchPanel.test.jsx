import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../../test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "../../services/tauriBridge";
import { setStore, branch } from "../../test/helpers";
import BranchPanel from "./BranchPanel";
import { useRepoStore } from "../../store/repoStore";

function stubRun() {
  useRepoStore.setState({
    run: vi.fn(async (operation) => {
      await operation("/repo");
      return true;
    }),
  });
}

const BRANCHES = [
  branch("main", { isHead: true, upstream: "origin/main", ahead: 2, behind: 1 }),
  branch("feature/login"),
  branch("origin/main", { isRemote: true }),
];

describe("BranchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    setStore({ branches: BRANCHES });
    stubRun();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("counts local branches separately from remote-tracking ones", () => {
    render(<BranchPanel />);

    expect(screen.getByText("LOCAL (2/2)")).toBeInTheDocument();
    expect(screen.getByText("REMOTE (1/1)")).toBeInTheDocument();
  });

  it("marks the checked-out branch", () => {
    const { container } = render(<BranchPanel />);
    const current = container.querySelector(".branch-row.current");

    expect(current).toHaveTextContent("main");
  });

  it("keeps a slashed local branch out of the remote section", () => {
    render(<BranchPanel />);

    // `feature/login` is local despite the slash — a real source of
    // misclassification when inferring from the short name.
    expect(screen.getByText("LOCAL (2/2)")).toBeInTheDocument();
    expect(screen.getByText("feature/login")).toBeInTheDocument();
  });

  describe("divergence", () => {
    it("shows ahead and behind counts", () => {
      render(<BranchPanel />);

      expect(screen.getByText("↑2")).toBeInTheDocument();
      expect(screen.getByText("↓1")).toBeInTheDocument();
    });

    it("shows nothing for a branch in step with its upstream", () => {
      setStore({ branches: [branch("main", { isHead: true, upstream: "origin/main" })] });
      stubRun();

      render(<BranchPanel />);
      expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("checks out another branch", () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getAllByTitle(/check out/i)[0]);

      expect(bridge.checkout).toHaveBeenCalledWith("/repo", "feature/login");
    });

    it("offers no checkout control on the current branch", () => {
      setStore({ branches: [branch("main", { isHead: true })] });
      stubRun();

      render(<BranchPanel />);
      expect(screen.queryByTitle(/check out/i)).not.toBeInTheDocument();
    });

    it("merges another branch into the current one", () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getByTitle(/merge into current/i));

      expect(bridge.mergeBranch).toHaveBeenCalledWith("/repo", "feature/login");
    });

    it("confirms before deleting a branch", () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getByTitle(/delete branch/i));

      expect(globalThis.confirm).toHaveBeenCalled();
      expect(bridge.deleteBranch).toHaveBeenCalledWith("/repo", "feature/login", false);
    });

    it("respects a declined delete", () => {
      globalThis.confirm.mockReturnValue(false);
      render(<BranchPanel />);

      fireEvent.click(screen.getByTitle(/delete branch/i));
      expect(bridge.deleteBranch).not.toHaveBeenCalled();
    });

    it("offers no destructive controls on remote-tracking branches", () => {
      setStore({ branches: [branch("origin/main", { isRemote: true })] });
      stubRun();

      render(<BranchPanel />);
      expect(screen.queryByTitle(/delete branch/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/merge into current/i)).not.toBeInTheDocument();
    });

    it("renames a branch inline", async () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getByTitle("Rename"));

      const input = screen.getByDisplayValue("feature/login");
      fireEvent.change(input, { target: { value: "feature/auth" } });
      fireEvent.submit(input.closest("form"));

      await waitFor(() => {
        expect(bridge.renameBranch).toHaveBeenCalledWith("/repo", "feature/login", "feature/auth");
      });
    });

    it("does not rename when the name is unchanged", async () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getByTitle("Rename"));

      const input = screen.getByDisplayValue("feature/login");
      fireEvent.submit(input.closest("form"));

      await waitFor(() => expect(bridge.renameBranch).not.toHaveBeenCalled());
    });

    it("creates and checks out a new branch", async () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getByRole("button", { name: "+" }));

      const input = screen.getByPlaceholderText(/new branch name/i);
      fireEvent.change(input, { target: { value: "spike" } });
      fireEvent.submit(input.closest("form"));

      await waitFor(() => {
        expect(bridge.checkoutNewBranch).toHaveBeenCalledWith("/repo", "spike", null);
      });
    });

    it("ignores a blank new-branch name", async () => {
      render(<BranchPanel />);
      fireEvent.click(screen.getByRole("button", { name: "+" }));

      const input = screen.getByPlaceholderText(/new branch name/i);
      fireEvent.change(input, { target: { value: "  " } });
      fireEvent.submit(input.closest("form"));

      await waitFor(() => expect(bridge.checkoutNewBranch).not.toHaveBeenCalled());
    });
  });

  it("checks out on double-click", () => {
    render(<BranchPanel />);
    fireEvent.doubleClick(screen.getByText("feature/login"));

    expect(bridge.checkout).toHaveBeenCalledWith("/repo", "feature/login");
  });
});
