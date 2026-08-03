import { useEffect } from "react";
import { useRepoStore } from "../../store/repoStore";
import "./UndoToast.css";

export function UndoToast() {
  const { undoToast, triggerUndo, triggerRedo, dismissUndoToast } = useRepoStore();

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent undo/redo in input / textarea text editing elements
      const tagName = document.activeElement?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea") return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Redo: Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, Cmd+Y
      if (isCtrlOrCmd && ((key === "z" && e.shiftKey) || key === "y")) {
        e.preventDefault();
        triggerRedo();
        return;
      }

      // Undo: Ctrl+Z or Cmd+Z (without Shift)
      if (isCtrlOrCmd && key === "z" && !e.shiftKey) {
        e.preventDefault();
        triggerUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerUndo, triggerRedo]);

  if (!undoToast) return null;

  return (
    <div className="undo-toast-container" data-testid="undo-toast">
      <span className="undo-toast-msg">{undoToast.message || "Action performed"}</span>
      {!undoToast.undone ? (
        <button className="undo-btn" onClick={triggerUndo} data-testid="undo-toast-btn">
          Undo (Ctrl+Z)
        </button>
      ) : (
        <button className="undo-btn redo-btn" onClick={triggerRedo} data-testid="redo-toast-btn">
          Redo (Ctrl+Shift+Z)
        </button>
      )}
      <button className="dismiss-btn" onClick={dismissUndoToast}>
        ✕
      </button>
    </div>
  );
}
