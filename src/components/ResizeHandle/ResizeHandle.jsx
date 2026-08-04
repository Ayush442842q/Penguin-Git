import "./ResizeHandle.css";

/**
 * `collapseDirection` is which way the chevron points to *open* the panel —
 * i.e. the direction the panel expands towards from its collapsed edge.
 */
export default function ResizeHandle({
  axis,
  onPointerDown,
  collapsed = false,
  onToggleCollapse,
  collapseDirection = "start",
  label,
}) {
  const chevron = axis === "x" ? (collapseDirection === "start" ? "◂" : "▸") : "▴";
  const openChevron = axis === "x" ? (collapseDirection === "start" ? "▸" : "◂") : "▾";

  return (
    <div
      className={`resize-handle resize-handle-${axis}${collapsed ? " collapsed" : ""}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    >
      {onToggleCollapse && (
        <button
          type="button"
          className="resize-handle-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={collapsed ? `Show ${label}` : `Hide ${label}`}
          aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
        >
          {collapsed ? openChevron : chevron}
        </button>
      )}
    </div>
  );
}
