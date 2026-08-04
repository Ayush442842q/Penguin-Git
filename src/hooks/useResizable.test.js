import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResizable } from "./useResizable";

describe("useResizable", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("starts at the given initial size when nothing is stored", () => {
    const { result } = renderHook(() =>
      useResizable({ axis: "x", initial: 260, min: 180, max: 480, storageKey: "test:w" })
    );
    expect(result.current.size).toBe(260);
    expect(result.current.collapsed).toBe(false);
  });

  it("restores a persisted size, clamped to min/max", () => {
    localStorage.setItem("test:w", "9999");
    const { result } = renderHook(() =>
      useResizable({ axis: "x", initial: 260, min: 180, max: 480, storageKey: "test:w" })
    );
    expect(result.current.size).toBe(480);
  });

  it("toggleCollapsed flips collapsed without touching size", () => {
    const { result } = renderHook(() =>
      useResizable({ axis: "x", initial: 260, min: 180, max: 480, storageKey: "test:w" })
    );

    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.size).toBe(260);

    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(false);
    expect(result.current.size).toBe(260);
  });

  it("persists the collapsed flag under its own storage key", () => {
    const { result } = renderHook(() =>
      useResizable({ axis: "x", initial: 260, min: 180, max: 480, storageKey: "test:w" })
    );
    act(() => result.current.toggleCollapsed());
    expect(localStorage.getItem("test:w:collapsed")).toBe("1");
  });

  it("restores collapsed state from localStorage on mount", () => {
    localStorage.setItem("test:w:collapsed", "1");
    const { result } = renderHook(() =>
      useResizable({ axis: "x", initial: 260, min: 180, max: 480, storageKey: "test:w" })
    );
    expect(result.current.collapsed).toBe(true);
  });

  it("ignores pointerdown drag start while collapsed", () => {
    const { result } = renderHook(() =>
      useResizable({ axis: "x", initial: 260, min: 180, max: 480, storageKey: "test:w" })
    );
    act(() => result.current.toggleCollapsed());

    const addSpy = vi.spyOn(document, "addEventListener");
    act(() => result.current.onPointerDown({ preventDefault: () => {}, clientX: 100 }));
    expect(addSpy).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
    addSpy.mockRestore();
  });
});
