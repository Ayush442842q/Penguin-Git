import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UndoToast } from "./UndoToast";
import { useRepoStore } from "../../store/repoStore";

describe("UndoToast Component", () => {
  const triggerUndo = vi.fn();
  const triggerRedo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({
      undoToast: { message: "Committed changes", undone: false },
      triggerUndo,
      triggerRedo,
    });
  });

  it("renders toast message and Undo button", () => {
    render(<UndoToast />);

    expect(screen.getByText("Committed changes")).toBeInTheDocument();
    expect(screen.getByTestId("undo-toast-btn")).toBeInTheDocument();
  });

  it("triggers undo when Undo button is clicked", () => {
    render(<UndoToast />);

    const btn = screen.getByTestId("undo-toast-btn");
    fireEvent.click(btn);

    expect(triggerUndo).toHaveBeenCalled();
  });

  it("triggers undo on Ctrl+Z keypress", () => {
    render(<UndoToast />);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(triggerUndo).toHaveBeenCalled();
  });

  it("renders Redo button when action is undone", () => {
    useRepoStore.setState({
      undoToast: { message: "Undid: Commit", undone: true },
      triggerUndo,
      triggerRedo,
    });

    render(<UndoToast />);

    expect(screen.getByTestId("redo-toast-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("undo-toast-btn")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("redo-toast-btn"));
    expect(triggerRedo).toHaveBeenCalled();
  });

  it("triggers redo on Ctrl+Shift+Z or Ctrl+Y keypress", () => {
    render(<UndoToast />);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(triggerRedo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(triggerRedo).toHaveBeenCalledTimes(2);
  });
});
