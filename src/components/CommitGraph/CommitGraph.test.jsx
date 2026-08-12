import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The factory is hoisted above these imports, so it must pull the stub in
// itself rather than close over anything defined in this file.
vi.mock("../../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../../test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "../../services/tauriBridge";
import { setStore, commit, row } from "../../test/helpers";
import CommitGraph, { WIP_ROW_HASH } from "./CommitGraph";
import { useRepoStore } from "../../store/repoStore";

/** A merge topology: tip merges a side branch that rejoins at the base. */
function mergeHistory() {
  return {
    commits: [
      commit("aaaaaaa1", "Merge feature", {
        parents: ["bbbbbbb2", "ccccccc3"],
        refs: ["HEAD -> main"],
      }),
      commit("bbbbbbb2", "Mainline work", { parents: ["ddddddd4"] }),
      commit("ccccccc3", "Feature work", { parents: ["ddddddd4"], refs: ["feature"] }),
      commit("ddddddd4", "Base", { parents: [] }),
    ],
    layout: {
      laneCount: 2,
      rows: [
        row("aaaaaaa1", 0, {
          outgoing: [
            { lane: 0, target: "bbbbbbb2" },
            { lane: 1, target: "ccccccc3" },
          ],
        }),
        row("bbbbbbb2", 0, {
          incoming: [
            { lane: 0, target: "bbbbbbb2" },
            { lane: 1, target: "ccccccc3" },
          ],
          outgoing: [
            { lane: 0, target: "ddddddd4" },
            { lane: 1, target: "ccccccc3" },
          ],
        }),
        row("ccccccc3", 1, {
          incoming: [
            { lane: 0, target: "ddddddd4" },
            { lane: 1, target: "ccccccc3" },
          ],
          outgoing: [
            { lane: 0, target: "ddddddd4" },
            { lane: 1, target: "ddddddd4" },
          ],
        }),
        row("ddddddd4", 0, {
          incoming: [
            { lane: 0, target: "ddddddd4" },
            { lane: 1, target: "ddddddd4" },
          ],
          mergedFrom: [1],
        }),
      ],
    },
  };
}

describe("CommitGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore(mergeHistory());
  });

  it("renders one row per commit with its subject, author, and short hash", () => {
    render(<CommitGraph />);

    expect(screen.getByText("Merge feature")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(screen.getByText("aaaaaaa")).toBeInTheDocument();
  });

  it("places each commit's dot in the lane the Rust layout assigned", () => {
    const { container } = render(<CommitGraph />);
    const rows = container.querySelectorAll(".graph-row");

    // Lane 0 sits at x=14, lane 1 at x=32 (LANE_ORIGIN + lane * LANE_WIDTH).
    const dotX = (index) => rows[index].querySelector("circle")?.getAttribute("cx");
    expect(dotX(0)).toBe("14"); // merge, lane 0
    expect(dotX(2)).toBe("32"); // feature, lane 1
    expect(dotX(3)).toBe("14"); // base, back on lane 0
  });

  it("draws a converging curve where a side branch is merged in", () => {
    const { container } = render(<CommitGraph />);
    const baseRow = container.querySelectorAll(".graph-row")[3];

    // mergedFrom: [1] — the side lane bends into the commit rather than
    // simply stopping, which is what makes a merge read as a join.
    expect(baseRow.querySelectorAll("path").length).toBe(1);
  });

  it("draws a lane opened by a merge as a curve out of the dot, not a line from above", () => {
    const { container } = render(<CommitGraph />);
    const mergeRow = container.querySelectorAll(".graph-row")[0];

    // Lane 1 is outgoing-only here. Rendering it as a full-height line would
    // show the branch arriving from nowhere above the merge commit.
    const path = mergeRow.querySelector("path");
    expect(path).not.toBeNull();
    expect(path.getAttribute("d")).toMatch(/^M 14 18/);
  });

  it("renders ref badges attached to their commit", () => {
    render(<CommitGraph />);

    expect(screen.getByText("HEAD -> main")).toBeInTheDocument();
    expect(screen.getByText("feature")).toBeInTheDocument();
  });

  describe("uncommitted work", () => {
    it("synthesizes a WIP row when the working tree is dirty", () => {
      setStore({
        ...mergeHistory(),
        status: {
          branch: "main",
          upstream: null,
          ahead: 0,
          behind: 0,
          staged: [{ path: "a.txt", kind: "modified" }],
          unstaged: [{ path: "b.txt", kind: "modified" }],
          untracked: [{ path: "c.txt", kind: "untracked" }],
          conflicted: [],
        },
      });

      render(<CommitGraph />);

      expect(screen.getByText("Uncommitted changes (3)")).toBeInTheDocument();
    });

    it("marks the WIP dot as provisional with a dashed outline", () => {
      setStore({
        ...mergeHistory(),
        status: { ...mergeHistory().status, staged: [{ path: "a.txt", kind: "modified" }] },
      });
      useRepoStore.setState({
        status: {
          branch: "main",
          upstream: null,
          ahead: 0,
          behind: 0,
          staged: [{ path: "a.txt", kind: "modified" }],
          unstaged: [],
          untracked: [],
          conflicted: [],
        },
      });

      const { container } = render(<CommitGraph />);
      const wipDot = container.querySelector(".graph-row.wip circle");

      expect(wipDot.getAttribute("stroke-dasharray")).toBeTruthy();
    });

    it("omits the WIP row when the working tree is clean", () => {
      render(<CommitGraph />);
      expect(screen.queryByText(/Uncommitted changes/)).not.toBeInTheDocument();
    });
  });

  describe("filtering", () => {
    it("matches on subject, author, and hash together", () => {
      render(<CommitGraph />);
      const filter = screen.getByPlaceholderText(/filter by message/i);

      fireEvent.change(filter, { target: { value: "feature" } });
      expect(screen.getByText("Feature work")).toBeInTheDocument();
      expect(screen.queryByText("Base")).not.toBeInTheDocument();

      fireEvent.change(filter, { target: { value: "ddddddd4" } });
      expect(screen.getByText("Base")).toBeInTheDocument();
      expect(screen.queryByText("Feature work")).not.toBeInTheDocument();
    });

    it("reports when nothing matches rather than rendering an empty list", () => {
      render(<CommitGraph />);
      fireEvent.change(screen.getByPlaceholderText(/filter by message/i), {
        target: { value: "nothing-matches-this" },
      });

      expect(screen.getByText(/no commits match/i)).toBeInTheDocument();
    });

    it("hides the WIP row while a filter is active", () => {
      setStore({
        status: {
          branch: "main",
          upstream: null,
          ahead: 0,
          behind: 0,
          staged: [{ path: "a.txt", kind: "modified" }],
          unstaged: [],
          untracked: [],
          conflicted: [],
        },
      });
      render(<CommitGraph />);
      expect(screen.getByText(/Uncommitted changes/)).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText(/filter by message/i), {
        target: { value: "Base" },
      });
      expect(screen.queryByText(/Uncommitted changes/)).not.toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("selects a commit on click", () => {
      render(<CommitGraph />);
      fireEvent.click(screen.getByText("Feature work"));

      expect(useRepoStore.getState().selectedCommit).toBe("ccccccc3");
    });

    it("selects a commit from the keyboard with Enter and Space", () => {
      const { container } = render(<CommitGraph />);
      const rows = container.querySelectorAll(".graph-row");

      // Commit selection drives the diff panel, so it cannot be mouse-only.
      fireEvent.keyDown(rows[1], { key: "Enter" });
      expect(useRepoStore.getState().selectedCommit).toBe("bbbbbbb2");

      fireEvent.keyDown(rows[2], { key: " " });
      expect(useRepoStore.getState().selectedCommit).toBe("ccccccc3");
    });

    it("exposes rows as focusable buttons", () => {
      const { container } = render(<CommitGraph />);
      const row0 = container.querySelector(".graph-row");

      expect(row0.getAttribute("role")).toBe("button");
      expect(row0.getAttribute("tabindex")).toBe("0");
    });
  });

  describe("context menu", () => {
    it("opens on right-click over a commit", () => {
      render(<CommitGraph />);
      fireEvent.contextMenu(screen.getByText("Feature work"));

      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByText(/cherry-pick/i)).toBeInTheDocument();
    });

    it("does not open on the WIP row, which has no commit to act on", () => {
      setStore({
        status: {
          branch: "main",
          upstream: null,
          ahead: 0,
          behind: 0,
          staged: [{ path: "a.txt", kind: "modified" }],
          unstaged: [],
          untracked: [],
          conflicted: [],
        },
      });
      render(<CommitGraph />);

      fireEvent.contextMenu(screen.getByText(/Uncommitted changes/));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("wires cherry-pick to the selected commit's hash", async () => {
      const run = vi.fn(async (op) => {
        await op("/repo");
        return true;
      });
      useRepoStore.setState({ run });

      render(<CommitGraph />);
      fireEvent.contextMenu(screen.getByText("Feature work"));
      fireEvent.click(screen.getByText(/cherry-pick/i));

      expect(bridge.cherryPick).toHaveBeenCalledWith("/repo", "ccccccc3");
    });
  });

  it("exports the WIP row's sentinel hash so other views can exclude it", () => {
    expect(WIP_ROW_HASH).toBe("__wip__");
  });
});

describe("CommitGraph with no history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore({ commits: [], layout: { rows: [], laneCount: 0 } });
  });

  it("renders an empty state rather than a bare list", () => {
    render(<CommitGraph />);
    expect(screen.getByText(/no commits yet/i)).toBeInTheDocument();
  });
});
