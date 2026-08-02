import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../../test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "../../services/tauriBridge";
import { setStore, file, CLEAN_STATUS } from "../../test/helpers";
import StagingPanel from "./StagingPanel";
import { useRepoStore } from "../../store/repoStore";

/** Runs the operation immediately so bridge calls are assertable. */
function stubRun() {
  const run = vi.fn(async (operation) => {
    await operation("/repo");
    return true;
  });
  useRepoStore.setState({ run });
  return run;
}

const DIRTY = {
  ...CLEAN_STATUS,
  staged: [file("staged.txt", "modified")],
  unstaged: [file("unstaged.txt", "modified")],
  untracked: [file("new.txt", "untracked")],
  conflicted: [],
};

describe("StagingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    setStore({ status: DIRTY });
    stubRun();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("groups files into staged, unstaged, and untracked sections", () => {
    render(<StagingPanel />);

    expect(screen.getByText("Staged (1)")).toBeInTheDocument();
    expect(screen.getByText("Unstaged (1)")).toBeInTheDocument();
    expect(screen.getByText("Untracked (1)")).toBeInTheDocument();
  });

  it("shows a rename as origin → destination", () => {
    setStore({
      status: {
        ...CLEAN_STATUS,
        staged: [file("after.txt", "renamed", { originalPath: "before.txt", similarity: 100 })],
      },
    });
    stubRun();

    render(<StagingPanel />);
    expect(screen.getByText("before.txt → after.txt")).toBeInTheDocument();
  });

  it("reports a clean tree instead of empty sections", () => {
    setStore({ status: CLEAN_STATUS });
    stubRun();

    render(<StagingPanel />);
    expect(screen.getByText(/working tree clean/i)).toBeInTheDocument();
  });

  describe("staging actions", () => {
    it("stages a single unstaged file", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getAllByTitle("Stage")[0]);

      expect(bridge.stageFile).toHaveBeenCalledWith("/repo", "unstaged.txt");
    });

    it("unstages a staged file", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getByTitle("Unstage"));

      expect(bridge.unstageFile).toHaveBeenCalledWith("/repo", "staged.txt");
    });

    it("stages everything at once", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getByText(/stage all/i));

      expect(bridge.stageAll).toHaveBeenCalled();
    });
  });

  describe("destructive actions", () => {
    it("confirms before discarding tracked changes", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getByTitle(/discard changes/i));

      expect(globalThis.confirm).toHaveBeenCalled();
      expect(bridge.discardFileChanges).toHaveBeenCalledWith("/repo", "unstaged.txt");
    });

    it("does not discard when the confirmation is declined", () => {
      globalThis.confirm.mockReturnValue(false);
      render(<StagingPanel />);

      fireEvent.click(screen.getByTitle(/discard changes/i));
      expect(bridge.discardFileChanges).not.toHaveBeenCalled();
    });

    it("confirms before deleting an untracked file", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getByTitle(/delete file/i));

      expect(globalThis.confirm).toHaveBeenCalled();
      expect(bridge.discardUntracked).toHaveBeenCalledWith("/repo", "new.txt");
    });
  });

  describe("committing", () => {
    it("refuses an empty message", () => {
      render(<StagingPanel />);
      expect(screen.getByRole("button", { name: /^commit/i })).toBeDisabled();
    });

    it("refuses to commit with nothing staged", () => {
      setStore({ status: { ...CLEAN_STATUS, unstaged: [file("a.txt", "modified")] } });
      stubRun();

      render(<StagingPanel />);
      fireEvent.change(screen.getByPlaceholderText(/commit message/i), {
        target: { value: "Something" },
      });

      expect(screen.getByRole("button", { name: /^commit/i })).toBeDisabled();
    });

    it("commits subject and body separately", async () => {
      render(<StagingPanel />);

      fireEvent.change(screen.getByPlaceholderText(/commit message/i), {
        target: { value: "Short subject" },
      });
      fireEvent.change(screen.getByPlaceholderText(/extended description/i), {
        target: { value: "Longer explanation." },
      });
      fireEvent.click(screen.getByRole("button", { name: /^commit/i }));

      await waitFor(() => {
        expect(bridge.commitChanges).toHaveBeenCalledWith(
          "/repo",
          "Short subject",
          "Longer explanation.",
          false
        );
      });
    });

    it("clears the message boxes after a successful commit", async () => {
      render(<StagingPanel />);
      const subject = screen.getByPlaceholderText(/commit message/i);

      fireEvent.change(subject, { target: { value: "Done" } });
      fireEvent.click(screen.getByRole("button", { name: /^commit/i }));

      await waitFor(() => expect(subject.value).toBe(""));
    });
  });

  describe("amend", () => {
    it("pre-fills the previous message when amend is ticked", async () => {
      bridge.getCommitMessage.mockResolvedValue("Previous subject\n\nPrevious body text.");
      render(<StagingPanel />);

      fireEvent.click(screen.getByLabelText(/amend last commit/i));

      // Retyping the old message from memory is how good messages get replaced
      // with worse ones.
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue("Previous subject");
      });
      expect(screen.getByPlaceholderText(/extended description/i)).toHaveValue(
        "Previous body text."
      );
    });

    it("allows amending with nothing staged", async () => {
      setStore({ status: CLEAN_STATUS });
      stubRun();
      bridge.getCommitMessage.mockResolvedValue("Fix typo");

      render(<StagingPanel />);
      fireEvent.click(screen.getByLabelText(/amend last commit/i));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^commit/i })).toBeEnabled();
      });
    });

    it("survives a repository with no commits to amend", async () => {
      bridge.getCommitMessage.mockRejectedValue("fatal: bad revision 'HEAD'");
      render(<StagingPanel />);

      fireEvent.click(screen.getByLabelText(/amend last commit/i));

      // The rejection is swallowed on purpose; the box just stays as it was.
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue("");
      });
    });

    it("sends the amend flag through to the backend", async () => {
      bridge.getCommitMessage.mockResolvedValue("Old message");
      render(<StagingPanel />);

      fireEvent.click(screen.getByLabelText(/amend last commit/i));
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue("Old message")
      );
      fireEvent.click(screen.getByRole("button", { name: /^commit/i }));

      await waitFor(() => {
        expect(bridge.commitChanges).toHaveBeenCalledWith("/repo", "Old message", "", true);
      });
    });
  });

  describe("conflicts", () => {
    it("surfaces conflicted files with a resolve action", () => {
      setStore({
        status: { ...CLEAN_STATUS, conflicted: [file("conflict.txt", "conflicted")] },
      });
      stubRun();

      render(<StagingPanel />);
      expect(screen.getByText("Conflicted (1)")).toBeInTheDocument();

      fireEvent.click(screen.getByText(/resolve/i));
      expect(bridge.stageFile).toHaveBeenCalledWith("/repo", "conflict.txt");
    });
  });

  describe("selection", () => {
    it("selects a staged file with its staged flag set", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getByText("staged.txt"));

      expect(useRepoStore.getState().selectedFile).toMatchObject({
        path: "staged.txt",
        staged: true,
      });
    });

    it("marks an untracked selection so the diff can be generated differently", () => {
      render(<StagingPanel />);
      fireEvent.click(screen.getByText("new.txt"));

      expect(useRepoStore.getState().selectedFile).toMatchObject({
        path: "new.txt",
        untracked: true,
      });
    });
  });

  it("disables actions while an operation is in flight", () => {
    setStore({ status: DIRTY, busy: true });
    render(<StagingPanel />);

    expect(screen.getByText(/stage all/i)).toBeDisabled();
  });
});
