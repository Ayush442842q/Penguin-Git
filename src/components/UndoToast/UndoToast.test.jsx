import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UndoToast } from "./UndoToast";
import { useRepoStore } from "../../store/repoStore";

describe("UndoToast Component", () => {
  const triggerUndo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({
      undoToast: { message: "Committed changes", undone: false },
      triggerUndo,
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
});
