import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../../test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "../../services/tauriBridge";
import { setStore, commit } from "../../test/helpers";
import DiffViewer from "./DiffViewer";
import { useRepoStore } from "../../store/repoStore";

const SAMPLE_DIFF = [
  "diff --git a/a.txt b/a.txt",
  "index 111..222 100644",
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1,2 +1,2 @@",
  "-old line",
  "+new line",
  " unchanged line",
].join("\n");

describe("DiffViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore();
  });

  it("prompts for a selection when nothing is chosen", () => {
    render(<DiffViewer />);
    expect(screen.getByText(/select a commit or a file/i)).toBeInTheDocument();
  });

  it("ignores the synthetic WIP row, which is not a real commit", () => {
    setStore({ selectedCommit: "__wip__" });
    render(<DiffViewer />);

    expect(screen.getByText(/select a commit or a file/i)).toBeInTheDocument();
    expect(bridge.getCommitDiff).not.toHaveBeenCalled();
  });

  describe("commit diffs", () => {
    it("loads and renders the diff for a selected commit", async () => {
      bridge.getCommitDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedCommit: "abcdef1234" });

      render(<DiffViewer />);

      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());
      expect(bridge.getCommitDiff).toHaveBeenCalledWith("/repo", "abcdef1234");
      expect(screen.getByText(/Commit abcdef1/)).toBeInTheDocument();
    });

    it("colours additions, deletions, hunks, and metadata differently", async () => {
      bridge.getCommitDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedCommit: "abcdef1234" });

      const { container } = render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());

      expect(container.querySelector(".diff-add")).toHaveTextContent("+new line");
      expect(container.querySelector(".diff-del")).toHaveTextContent("-old line");
      expect(container.querySelector(".diff-hunk")).toHaveTextContent("@@");
      expect(container.querySelector(".diff-meta")).toBeTruthy();
    });

    it("reports an empty diff rather than a blank pane", async () => {
      bridge.getCommitDiff.mockResolvedValue("   ");
      setStore({ selectedCommit: "abcdef1234" });

      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText(/no changes to show/i)).toBeInTheDocument());
    });

    it("surfaces a backend error instead of failing silently", async () => {
      bridge.getCommitDiff.mockRejectedValue("fatal: bad object");
      setStore({ selectedCommit: "nope" });

      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText(/bad object/)).toBeInTheDocument());
    });
  });

  describe("file diffs", () => {
    it("requests the staged diff for a staged selection", async () => {
      bridge.getFileDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedFile: { path: "a.txt", staged: true, untracked: false } });

      render(<DiffViewer />);

      await waitFor(() => expect(bridge.getFileDiff).toHaveBeenCalledWith("/repo", "a.txt", true));
    });

    it("uses the untracked path for a file git isn't tracking yet", async () => {
      bridge.getUntrackedDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedFile: { path: "new.txt", staged: false, untracked: true } });

      render(<DiffViewer />);

      await waitFor(() => expect(bridge.getUntrackedDiff).toHaveBeenCalledWith("/repo", "new.txt"));
      expect(bridge.getFileDiff).not.toHaveBeenCalled();
    });

    it("renders stage hunk button for unstaged file and invokes gitStageHunk on click", async () => {
      bridge.getFileDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedFile: { path: "a.txt", staged: false, untracked: false } });

      render(<DiffViewer />);

      await waitFor(() => expect(screen.getByText("+ Stage Hunk")).toBeInTheDocument());

      const stageBtn = screen.getByText("+ Stage Hunk");
      fireEvent.click(stageBtn);

      await waitFor(() => {
        expect(bridge.gitStageHunk).toHaveBeenCalledWith(
          "/repo",
          expect.stringContaining("diff --git a/a.txt b/a.txt")
        );
      });
    });

    it("stages hunk for untracked files using original diff headers", async () => {
      const UNTRACKED_DIFF = [
        "diff --git a/dev/null b/new.txt",
        "new file mode 100644",
        "index 0000000..3333333",
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1,1 @@",
        "+first line",
      ].join("\n");

      bridge.getUntrackedDiff.mockResolvedValue(UNTRACKED_DIFF);
      setStore({ selectedFile: { path: "new.txt", staged: false, untracked: true } });

      render(<DiffViewer />);

      await waitFor(() => expect(screen.getByText("+ Stage Hunk")).toBeInTheDocument());

      const stageBtn = screen.getByText("+ Stage Hunk");
      fireEvent.click(stageBtn);

      await waitFor(() => {
        expect(bridge.gitStageHunk).toHaveBeenCalledWith(
          "/repo",
          [
            "diff --git a/dev/null b/new.txt",
            "new file mode 100644",
            "index 0000000..3333333",
            "--- /dev/null",
            "+++ b/new.txt",
            "@@ -0,0 +1,1 @@",
            "+first line",
            "",
          ].join("\n")
        );
      });
    });
  });

  describe("tabs", () => {
    beforeEach(() => {
      bridge.getFileDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedFile: { path: "a.txt", staged: false, untracked: false } });
    });

    it("offers diff, history, and blame for a file", async () => {
      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());

      expect(screen.getByText("Diff")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
      expect(screen.getByText("Blame")).toBeInTheDocument();
    });

    it("loads file history on demand", async () => {
      bridge.getFileHistory.mockResolvedValue([commit("aaaaaaa1", "Earlier change")]);
      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());

      fireEvent.click(screen.getByText("History"));

      await waitFor(() => expect(screen.getByText("Earlier change")).toBeInTheDocument());
      expect(bridge.getFileHistory).toHaveBeenCalledWith("/repo", "a.txt");
    });

    it("loads blame annotations on demand", async () => {
      bridge.getBlame.mockResolvedValue([
        {
          hash: "aaaaaaa1111",
          authorName: "Ada Lovelace",
          timestamp: 1_700_000_000,
          lineNumber: 1,
          content: "first line",
          summary: "Initial commit",
        },
      ]);
      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Blame"));

      await waitFor(() => expect(screen.getByText("first line")).toBeInTheDocument());
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });

    it("offers no tabs for a commit, which has no history or blame", async () => {
      bridge.getCommitDiff.mockResolvedValue(SAMPLE_DIFF);
      setStore({ selectedCommit: "abcdef1234", selectedFile: null });

      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());

      expect(screen.queryByText("Blame")).not.toBeInTheDocument();
    });
  });

  describe("stale content", () => {
    it("does not show a previous selection's diff against a new one", async () => {
      let releaseSecond;
      bridge.getCommitDiff
        .mockResolvedValueOnce("diff --git a/first b/first\n+first commit content")
        .mockImplementationOnce(() => new Promise((r) => (releaseSecond = r)));

      setStore({ selectedCommit: "first00" });
      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+first commit content")).toBeInTheDocument());

      // Switch selection; the new diff hasn't resolved yet.
      act(() => {
        useRepoStore.getState().selectCommit("second0");
      });

      await waitFor(() => {
        expect(screen.queryByText("+first commit content")).not.toBeInTheDocument();
      });

      releaseSecond("diff --git a/second b/second\n+second commit content");
      await waitFor(() => expect(screen.getByText("+second commit content")).toBeInTheDocument());
    });
  });

  describe("history rows", () => {
    it("selects a commit from the keyboard", async () => {
      bridge.getFileDiff.mockResolvedValue(SAMPLE_DIFF);
      bridge.getFileHistory.mockResolvedValue([commit("aaaaaaa1", "Earlier change")]);
      setStore({ selectedFile: { path: "a.txt", staged: false, untracked: false } });

      render(<DiffViewer />);
      await waitFor(() => expect(screen.getByText("+new line")).toBeInTheDocument());
      fireEvent.click(screen.getByText("History"));
      await waitFor(() => expect(screen.getByText("Earlier change")).toBeInTheDocument());

      const historyRow = screen.getByText("Earlier change").closest("li");
      expect(historyRow.getAttribute("role")).toBe("button");
      fireEvent.keyDown(historyRow, { key: "Enter" });

      expect(useRepoStore.getState().selectedCommit).toBe("aaaaaaa1");
    });
  });

  describe("virtualization", () => {
    it("renders far fewer nodes than a large diff has lines", async () => {
      const lines = ["diff --git a/big b/big", "@@ -1,2000 +1,2000 @@"];
      for (let i = 0; i < 2000; i++) lines.push(`+line ${i}`);
      bridge.getCommitDiff.mockResolvedValue(lines.join("\n"));
      setStore({ selectedCommit: "big0000" });

      const { container } = render(<DiffViewer />);
      await waitFor(() => expect(container.querySelector(".diff-line")).toBeTruthy());

      // Mounting one node per line freezes the webview on a large commit.
      const rendered = container.querySelectorAll(".diff-line").length;
      expect(rendered).toBeGreaterThan(0);
      expect(rendered).toBeLessThan(200);
    });
  });
});
