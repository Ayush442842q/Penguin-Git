import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../services/tauriBridge", async () => {
  const { makeBridgeMock } = await import("../../test/bridgeMock");
  return makeBridgeMock();
});

import * as bridge from "../../services/tauriBridge";
import { setStore, stash, file, CLEAN_STATUS } from "../../test/helpers";
import StashPanel from "./StashPanel";
import { useRepoStore } from "../../store/repoStore";

function stubRun() {
  useRepoStore.setState({
    run: vi.fn(async (operation) => {
      await operation("/repo");
      return true;
    }),
  });
}

const STASHES = [stash(0, "newer work"), stash(1, "older work")];

describe("StashPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    setStore({ stashes: STASHES });
    stubRun();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists stashes with their messages", () => {
    render(<StashPanel />);

    expect(screen.getByText("Stashes (2)")).toBeInTheDocument();
    expect(screen.getByText("newer work")).toBeInTheDocument();
    expect(screen.getByText("older work")).toBeInTheDocument();
  });

  it("reports an empty stack rather than nothing at all", () => {
    setStore({ stashes: [] });
    stubRun();

    render(<StashPanel />);
    expect(screen.getByText(/no stashes/i)).toBeInTheDocument();
  });

  describe("apply versus pop", () => {
    // These are different operations and the UI must keep them distinct:
    // apply keeps the safety net, pop consumes it.
    it("offers both as separate controls", () => {
      render(<StashPanel />);

      expect(screen.getAllByText("Apply")).toHaveLength(2);
      expect(screen.getAllByText("Pop")).toHaveLength(2);
    });

    it("applies without consuming the entry", () => {
      render(<StashPanel />);
      fireEvent.click(screen.getAllByText("Apply")[0]);

      expect(bridge.applyStash).toHaveBeenCalledTimes(1);
      expect(bridge.popStash).not.toHaveBeenCalled();
    });

    it("pops as a distinct call", () => {
      render(<StashPanel />);
      fireEvent.click(screen.getAllByText("Pop")[0]);

      expect(bridge.popStash).toHaveBeenCalledTimes(1);
      expect(bridge.applyStash).not.toHaveBeenCalled();
    });

    it("explains the difference in each button's tooltip", () => {
      render(<StashPanel />);

      expect(screen.getAllByTitle(/keep the stash/i)[0]).toBeInTheDocument();
      expect(screen.getAllByTitle(/remove the stash/i)[0]).toBeInTheDocument();
    });
  });

  describe("stale-index protection", () => {
    it("sends the entry's hash alongside its index", () => {
      render(<StashPanel />);
      fireEvent.click(screen.getAllByText("Apply")[1]);

      // Indices renumber on every push/pop/drop, so the hash is what lets the
      // backend refuse to act on a list that has gone stale.
      expect(bridge.applyStash).toHaveBeenCalledWith("/repo", 1, "stashhash1");
    });

    it("sends the hash for pop and drop too", () => {
      render(<StashPanel />);

      fireEvent.click(screen.getAllByText("Pop")[0]);
      expect(bridge.popStash).toHaveBeenCalledWith("/repo", 0, "stashhash0");

      fireEvent.click(screen.getAllByTitle(/drop/i)[1]);
      expect(bridge.dropStash).toHaveBeenCalledWith("/repo", 1, "stashhash1");
    });
  });

  describe("dropping", () => {
    it("confirms first, since dropping restores nothing", () => {
      render(<StashPanel />);
      fireEvent.click(screen.getAllByTitle(/drop/i)[0]);

      expect(globalThis.confirm).toHaveBeenCalled();
      expect(globalThis.confirm.mock.calls[0][0]).toMatch(/cannot be undone/i);
      expect(bridge.dropStash).toHaveBeenCalled();
    });

    it("respects a declined confirmation", () => {
      globalThis.confirm.mockReturnValue(false);
      render(<StashPanel />);

      fireEvent.click(screen.getAllByTitle(/drop/i)[0]);
      expect(bridge.dropStash).not.toHaveBeenCalled();
    });
  });

  describe("saving", () => {
    it("hides the save control when there is nothing to stash", () => {
      setStore({ stashes: STASHES, status: CLEAN_STATUS });
      stubRun();

      render(<StashPanel />);
      expect(screen.queryByRole("button", { name: "+" })).not.toBeInTheDocument();
    });

    it("saves with a message and includes untracked files", async () => {
      setStore({
        stashes: STASHES,
        status: { ...CLEAN_STATUS, unstaged: [file("a.txt", "modified")] },
      });
      stubRun();

      render(<StashPanel />);
      fireEvent.click(screen.getByRole("button", { name: "+" }));
      fireEvent.change(screen.getByPlaceholderText(/stash message/i), {
        target: { value: "half-finished" },
      });
      fireEvent.submit(screen.getByPlaceholderText(/stash message/i).closest("form"));

      await waitFor(() => {
        expect(bridge.saveStash).toHaveBeenCalledWith("/repo", "half-finished", true);
      });
    });
  });

  it("disables every action while an operation is in flight", () => {
    setStore({ stashes: STASHES, busy: true });
    render(<StashPanel />);

    expect(screen.getAllByText("Apply")[0]).toBeDisabled();
    expect(screen.getAllByText("Pop")[0]).toBeDisabled();
  });
});
