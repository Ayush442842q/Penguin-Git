import "./ResizeHandle.css";

export default function ResizeHandle({ axis, onPointerDown }) {
  return (
    <div
      className={`resize-handle resize-handle-${axis}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    />
  );
}
