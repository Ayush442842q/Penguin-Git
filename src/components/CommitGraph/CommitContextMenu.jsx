import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Keeps the menu fully on screen when opened near an edge. */
const VIEWPORT_MARGIN = 8;

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
  onExplainCommit,
}) {
  const ref = useRef(null);
  const [prompt, setPrompt] = useState(null);
  const [value, setValue] = useState("");
  const [position, setPosition] = useState({ top: y, left: x });

  // Measure after mount and pull the menu back inside the viewport. Opened on a
  // row near the bottom or right edge it would otherwise render partly offscreen,
  // with the destructive reset actions the first thing to be cut off.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      top: Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN)),
      left: Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN)),
    });
  }, [x, y, prompt]);

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
      style={{ top: position.top, left: position.left }}
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
          {onExplainCommit && (
            <button type="button" role="menuitem" onClick={onExplainCommit}>
              ✨ Explain Commit with AI
            </button>
          )}
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
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              // The only menu action that destroys uncommitted work outright,
              // with nothing in the reflog to recover the working tree from.
              if (
                confirm(
                  `Reset --hard to ${commit.shortHash}?\n\nThis permanently discards all uncommitted changes in your working tree. It cannot be undone.`
                )
              ) {
                onReset("hard");
              }
            }}
          >
            Reset — hard <span className="text-dim">(discard all changes)</span>
          </button>
        </>
      )}
    </div>
  );
}
