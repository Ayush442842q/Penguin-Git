import { useEffect, useRef, useState } from "react";

/**
 * Right-click actions for a commit.
 *
 * `reset --hard` and the destructive branch of each action are marked so they
 * read differently from the reversible ones — the menu is one click away from
 * discarding uncommitted work.
 */
export default function CommitContextMenu({
  x,
  y,
  commit,
  onClose,
  onCherryPick,
  onRevert,
  onReset,
  onTag,
  onBranch,
}) {
  const ref = useRef(null);
  const [prompt, setPrompt] = useState(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const submitPrompt = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (prompt === "tag") onTag(trimmed);
    if (prompt === "branch") onBranch(trimmed);
  };

  const openPrompt = (kind) => {
    setPrompt(kind);
    setValue("");
  };

  return (
    <div
      ref={ref}
      className="context-menu fade-in"
      style={{ top: y, left: x }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="context-menu-title mono truncate">{commit.shortHash}</div>

      {prompt ? (
        <form className="context-menu-prompt" onSubmit={submitPrompt}>
          <input
            type="text"
            autoFocus
            placeholder={prompt === "tag" ? "Tag name" : "Branch name"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="context-menu-prompt-actions">
            <button type="button" className="ghost" onClick={() => setPrompt(null)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              {prompt === "tag" ? "Create tag" : "Create branch"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <button type="button" role="menuitem" onClick={onCherryPick}>
            Cherry-pick onto current branch
          </button>
          <button type="button" role="menuitem" onClick={onRevert}>
            Revert this commit
          </button>
          <button type="button" role="menuitem" onClick={() => openPrompt("branch")}>
            Branch from here…
          </button>
          <button type="button" role="menuitem" onClick={() => openPrompt("tag")}>
            Tag this commit…
          </button>

          <div className="context-menu-separator" />

          <button type="button" role="menuitem" onClick={() => onReset("soft")}>
            Reset — soft <span className="text-dim">(keep changes staged)</span>
          </button>
          <button type="button" role="menuitem" onClick={() => onReset("mixed")}>
            Reset — mixed <span className="text-dim">(keep changes unstaged)</span>
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => onReset("hard")}>
            Reset — hard <span className="text-dim">(discard all changes)</span>
          </button>
        </>
      )}
    </div>
  );
}
