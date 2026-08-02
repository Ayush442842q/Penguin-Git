import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CommitContextMenu from "./CommitContextMenu";

const COMMIT = { hash: "abcdef1234567890", shortHash: "abcdef1" };

function renderMenu(overrides = {}) {
  const handlers = {
    onClose: vi.fn(),
    onCherryPick: vi.fn(),
    onRevert: vi.fn(),
    onReset: vi.fn(),
    onTag: vi.fn(),
    onBranch: vi.fn(),
    ...overrides,
  };
  const utils = render(<CommitContextMenu x={100} y={100} commit={COMMIT} {...handlers} />);
  return { ...utils, handlers };
}

describe("CommitContextMenu", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the commit it will act on", () => {
    renderMenu();
    expect(screen.getByText("abcdef1")).toBeInTheDocument();
  });

  it("invokes cherry-pick and revert directly", () => {
    const { handlers } = renderMenu();

    fireEvent.click(screen.getByText(/cherry-pick/i));
    expect(handlers.onCherryPick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/revert this commit/i));
    expect(handlers.onRevert).toHaveBeenCalledTimes(1);
  });

  describe("reset", () => {
    it("runs soft and mixed resets without prompting", () => {
      const { handlers } = renderMenu();

      fireEvent.click(screen.getByText(/reset — soft/i));
      fireEvent.click(screen.getByText(/reset — mixed/i));

      expect(globalThis.confirm).not.toHaveBeenCalled();
      expect(handlers.onReset).toHaveBeenNthCalledWith(1, "soft");
      expect(handlers.onReset).toHaveBeenNthCalledWith(2, "mixed");
    });

    it("confirms before a hard reset", () => {
      const { handlers } = renderMenu();

      fireEvent.click(screen.getByText(/reset — hard/i));

      expect(globalThis.confirm).toHaveBeenCalledTimes(1);
      expect(globalThis.confirm.mock.calls[0][0]).toMatch(/cannot be undone/i);
      expect(handlers.onReset).toHaveBeenCalledWith("hard");
    });

    it("does nothing when the hard-reset confirmation is declined", () => {
      globalThis.confirm.mockReturnValue(false);
      const { handlers } = renderMenu();

      fireEvent.click(screen.getByText(/reset — hard/i));

      // The one menu action that destroys uncommitted work with nothing in the
      // reflog to recover the tree from — declining must be respected.
      expect(handlers.onReset).not.toHaveBeenCalled();
    });
  });

  describe("naming prompts", () => {
    it("creates a tag with the entered name", () => {
      const { handlers } = renderMenu();

      fireEvent.click(screen.getByText(/tag this commit/i));
      fireEvent.change(screen.getByPlaceholderText("Tag name"), { target: { value: "v1.0.0" } });
      fireEvent.click(screen.getByText(/create tag/i));

      expect(handlers.onTag).toHaveBeenCalledWith("v1.0.0");
    });

    it("creates a branch with the entered name", () => {
      const { handlers } = renderMenu();

      fireEvent.click(screen.getByText(/branch from here/i));
      fireEvent.change(screen.getByPlaceholderText("Branch name"), {
        target: { value: "feature/login" },
      });
      fireEvent.click(screen.getByText(/create branch/i));

      expect(handlers.onBranch).toHaveBeenCalledWith("feature/login");
    });

    it("ignores a blank or whitespace-only name", () => {
      const { handlers } = renderMenu();

      fireEvent.click(screen.getByText(/tag this commit/i));
      fireEvent.change(screen.getByPlaceholderText("Tag name"), { target: { value: "   " } });
      fireEvent.click(screen.getByText(/create tag/i));

      expect(handlers.onTag).not.toHaveBeenCalled();
    });

    it("returns to the action list on cancel", () => {
      renderMenu();

      fireEvent.click(screen.getByText(/tag this commit/i));
      expect(screen.getByPlaceholderText("Tag name")).toBeInTheDocument();

      fireEvent.click(screen.getByText(/cancel/i));
      expect(screen.queryByPlaceholderText("Tag name")).not.toBeInTheDocument();
      expect(screen.getByText(/cherry-pick/i)).toBeInTheDocument();
    });
  });

  describe("dismissal", () => {
    it("closes on Escape", () => {
      const { handlers } = renderMenu();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(handlers.onClose).toHaveBeenCalled();
    });

    it("closes on a click outside", () => {
      const { handlers } = renderMenu();
      fireEvent.mouseDown(document.body);
      expect(handlers.onClose).toHaveBeenCalled();
    });

    it("stays open on a click inside", () => {
      const { handlers } = renderMenu();
      fireEvent.mouseDown(screen.getByRole("menu"));
      expect(handlers.onClose).not.toHaveBeenCalled();
    });
  });

  describe("positioning", () => {
    it("opens at the pointer when there is room", () => {
      // The jsdom shim reports a 1280x800 viewport and a 1280x800 element, so
      // clamping pins it to the top-left margin; what matters is that it never
      // exceeds the viewport.
      render(
        <CommitContextMenu x={10} y={10} commit={COMMIT} onClose={vi.fn()} onReset={vi.fn()} />
      );
      const menu = screen.getByRole("menu");

      expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(menu.style.top)).toBeGreaterThanOrEqual(0);
    });

    it("never positions the menu past the viewport edge", () => {
      render(
        <CommitContextMenu
          x={99999}
          y={99999}
          commit={COMMIT}
          onClose={vi.fn()}
          onReset={vi.fn()}
        />
      );
      const menu = screen.getByRole("menu");

      // Opened on a row near the bottom-right, an unclamped menu would push the
      // destructive reset actions off-screen entirely.
      expect(parseFloat(menu.style.left)).toBeLessThan(99999);
      expect(parseFloat(menu.style.top)).toBeLessThan(99999);
    });
  });
});
