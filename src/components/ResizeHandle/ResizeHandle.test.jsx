import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResizeHandle from "./ResizeHandle";

describe("ResizeHandle", () => {
  it("renders no toggle button when onToggleCollapse is not provided", () => {
    render(<ResizeHandle axis="x" onPointerDown={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onToggleCollapse and not onPointerDown when the toggle is clicked", () => {
    const onPointerDown = vi.fn();
    const onToggleCollapse = vi.fn();

    render(
      <ResizeHandle
        axis="x"
        onPointerDown={onPointerDown}
        onToggleCollapse={onToggleCollapse}
        label="sidebar"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("shows the show-panel label and reversed chevron when collapsed", () => {
    render(
      <ResizeHandle
        axis="x"
        onPointerDown={() => {}}
        collapsed
        onToggleCollapse={() => {}}
        label="sidebar"
      />
    );
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();
  });
});
