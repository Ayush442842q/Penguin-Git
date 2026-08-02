import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import "./RebaseDialog.css";

export function RebaseDialog({ baseRef, initialCommits = [] }) {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const repo = slice?.repo;
  const refresh = useRepoStore((s) => s.refresh);
  const closeInteractiveRebase = useRepoStore((s) => s.closeInteractiveRebase);

  const [todoItems, setTodoItems] = useState(
    initialCommits.map((c) => ({
      action: "pick",
      hash: c.hash || c.sha || "",
      message: c.subject || c.message || "",
    }))
  );

  const [loading, setLoading] = useState(false);

  const handleActionChange = (index, newAction) => {
    const updated = [...todoItems];
    updated[index].action = newAction;
    setTodoItems(updated);
  };

  const handleMessageChange = (index, newMsg) => {
    const updated = [...todoItems];
    updated[index].message = newMsg;
    setTodoItems(updated);
  };

  const moveItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= todoItems.length) return;
    const updated = [...todoItems];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setTodoItems(updated);
  };

  const handleExecuteRebase = async () => {
    if (!repo || !baseRef) return;
    setLoading(true);
    try {
      await git.interactiveRebase(repo.id, baseRef, todoItems);
      await refresh();
      closeInteractiveRebase();
    } catch (err) {
      console.error("Interactive rebase failed:", err);
      useRepoStore.setState({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rebase-modal-overlay" data-testid="rebase-dialog">
      <div className="rebase-modal-content">
        <div className="rebase-modal-header">
          <span className="rebase-modal-title">Interactive Rebase onto {baseRef}</span>
          <button className="icon-btn" onClick={closeInteractiveRebase}>
            ✕
          </button>
        </div>

        <div className="rebase-modal-body">
          {todoItems.map((item, idx) => (
            <div key={item.hash || idx} className="rebase-item" data-testid="rebase-item">
              <select
                className="rebase-action-select"
                value={item.action}
                onChange={(e) => handleActionChange(idx, e.target.value)}
                data-testid={`action-select-${idx}`}
              >
                <option value="pick">pick</option>
                <option value="reword">reword</option>
                <option value="edit">edit</option>
                <option value="squash">squash</option>
                <option value="fixup">fixup</option>
                <option value="drop">drop</option>
              </select>

              <span className="rebase-hash">{item.hash.substring(0, 7)}</span>

              <input
                type="text"
                className="rebase-msg-input"
                value={item.message}
                onChange={(e) => handleMessageChange(idx, e.target.value)}
              />

              <div className="rebase-item-controls">
                <button
                  className="icon-btn"
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  title="Move Up"
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === todoItems.length - 1}
                  title="Move Down"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rebase-modal-footer">
          <button className="btn btn-secondary" onClick={closeInteractiveRebase}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExecuteRebase}
            disabled={loading}
            data-testid="start-rebase-btn"
          >
            {loading ? "Rebasing..." : "Start Rebase"}
          </button>
        </div>
      </div>
    </div>
  );
}
