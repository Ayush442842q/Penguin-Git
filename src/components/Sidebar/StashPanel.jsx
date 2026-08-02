import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";

function formatDate(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function StashPanel() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const stashes = slice?.stashes || [];
  const status = slice?.status;
  const busy = useRepoStore((s) => s.busy);
  const run = useRepoStore((s) => s.run);
  const selectFile = useRepoStore((s) => s.selectFile);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const hasChanges =
    !!status &&
    (status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0);

  const submitSave = async (event) => {
    event.preventDefault();
    const ok = await run((path) => git.saveStash(path, message.trim(), true));
    if (ok) {
      setMessage("");
      setSaving(false);
    }
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span className="section-label">Stashes ({stashes.length})</span>
        {hasChanges && (
          <button className="ghost" disabled={busy} onClick={() => setSaving((open) => !open)}>
            +
          </button>
        )}
      </div>

      {saving && (
        <form className="branch-create" onSubmit={submitSave}>
          <input
            type="text"
            autoFocus
            placeholder="Stash message (optional)"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </form>
      )}

      <ul className="sidebar-list">
        {stashes.length === 0 && <li className="sidebar-empty text-muted">No stashes.</li>}
        {stashes.map((stash) => (
          <li
            key={stash.index}
            className="sidebar-row stash-row"
            onClick={() => selectFile(null)}
            title={`On ${stash.branch}`}
          >
            <span className="truncate">{stash.message}</span>
            <span className="text-dim stash-date">{formatDate(stash.timestamp)}</span>
            <span className="row-actions">
              {/* Apply and pop are separate buttons on purpose: one keeps the
                  stash, the other consumes it, and conflating them loses work. */}
              <button
                className="ghost"
                disabled={busy}
                title="Apply — restore these changes and keep the stash"
                onClick={() => run((path) => git.applyStash(path, stash.index, stash.hash))}
              >
                Apply
              </button>
              <button
                className="ghost"
                disabled={busy}
                title="Pop — restore these changes and remove the stash"
                onClick={() => run((path) => git.popStash(path, stash.index, stash.hash))}
              >
                Pop
              </button>
              <button
                className="ghost danger"
                disabled={busy}
                title="Drop — delete this stash without restoring it"
                onClick={() => {
                  if (confirm(`Drop stash "${stash.message}"? This cannot be undone.`)) {
                    run((path) => git.dropStash(path, stash.index, stash.hash));
                  }
                }}
              >
                ⨯
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
