import { useEffect } from "react";
import { useRepoStore } from "../../store/repoStore";
import "./UndoToast.css";

export function UndoToast() {
  const { undoToast, triggerUndo, dismissUndoToast } = useRepoStore();

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        // Prevent undo in input / textarea text editing elements
        const tagName = document.activeElement?.tagName?.toLowerCase();
        if (tagName === "input" || tagName === "textarea") return;

        e.preventDefault();
        triggerUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerUndo]);

  if (!undoToast) return null;

  return (
    <div className="undo-toast-container" data-testid="undo-toast">
      <span className="undo-toast-msg">{undoToast.message || "Action performed"}</span>
      {!undoToast.undone && (
        <button className="undo-btn" onClick={triggerUndo} data-testid="undo-toast-btn">
          Undo (Ctrl+Z)
        </button>
      )}
      <button className="dismiss-btn" onClick={dismissUndoToast}>
        ✕
      </button>
    </div>
  );
}
