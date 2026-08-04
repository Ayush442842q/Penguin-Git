import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-resize a single numeric dimension (pixels), persisted to localStorage.
 * `reverse` flips delta direction — for a panel whose handle sits on its
 * leading edge (e.g. a right-side panel growing as the pointer moves left).
 *
 * Also tracks a `collapsed` flag (its own localStorage key) so a panel can be
 * hidden entirely without losing the size the user dragged it to — collapsing
 * never touches `size`, it only changes what gets rendered.
 */
export function useResizable({ axis, initial, min, max, storageKey, reverse = false }) {
  const [size, setSize] = useState(() => {
    const stored = storageKey ? Number(localStorage.getItem(storageKey)) : NaN;
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : initial;
  });
  const collapsedKey = storageKey ? `${storageKey}:collapsed` : null;
  const [collapsed, setCollapsed] = useState(
    () => !!collapsedKey && localStorage.getItem(collapsedKey) === "1"
  );
  const dragState = useRef(null);
  const stopDraggingRef = useRef(() => {});

  useEffect(() => {
    if (collapsedKey) localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
  }, [collapsed, collapsedKey]);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, String(size));
  }, [size, storageKey]);

  const onPointerMove = useCallback(
    (e) => {
      if (!dragState.current) return;
      const { startPos, startSize } = dragState.current;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = reverse ? startPos - pos : pos - startPos;
      setSize(clamp(startSize + delta, min, max));
    },
    [axis, max, min, reverse]
  );

  useEffect(() => {
    stopDraggingRef.current = () => {
      dragState.current = null;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopDraggingRef.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    return () => stopDraggingRef.current();
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (e) => {
      if (collapsed) return;
      e.preventDefault();
      dragState.current = { startPos: axis === "x" ? e.clientX : e.clientY, startSize: size };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", stopDraggingRef.current);
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [axis, size, onPointerMove, collapsed]
  );

  return { size, onPointerDown, collapsed, toggleCollapsed };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
