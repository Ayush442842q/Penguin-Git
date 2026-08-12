import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import ExplainBranchModal from "../AiModals/ExplainBranchModal";
import PrDescriptionModal from "../AiModals/PrDescriptionModal";

/** Ahead/behind chips, only rendered when the branch actually diverges. */
function DivergenceBadges({ ahead, behind }) {
  if (!ahead && !behind) return null;
  return (
    <span className="branch-divergence">
      {ahead > 0 && <span className="badge badge-green">↑{ahead}</span>}
      {behind > 0 && <span className="badge badge-blue">↓{behind}</span>}
    </span>
  );
}

function BranchRow({ branch, busy, run, onExplainBranch, onGeneratePr }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(branch.name);

  const submitRename = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    setRenaming(false);
    if (trimmed && trimmed !== branch.name) {
      run((path) => git.renameBranch(path, branch.name, trimmed));
    }
  };

  if (renaming) {
    return (
      <li className="sidebar-row">
        <form onSubmit={submitRename} className="branch-rename">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={submitRename}
          />
        </form>
      </li>
    );
  }

  return (
    <li
      className={`sidebar-row branch-row${branch.isHead ? " current" : ""}`}
      onDoubleClick={() => !branch.isRemote && run((path) => git.checkout(path, branch.name))}
    >
      <span className="truncate" title={branch.subject}>
        <span className="branch-icon">⎇</span>
        {branch.isHead && <span className="branch-head-marker">●</span>}
        {branch.name}
      </span>
      <DivergenceBadges ahead={branch.ahead} behind={branch.behind} />
      <span className="row-actions">
        {!branch.isRemote && (
          <>
            <button
              className="ghost"
              disabled={busy}
              title="Explain Branch with AI"
              onClick={(e) => {
                e.stopPropagation();
                onExplainBranch(branch.name);
              }}
            >
              🔍
            </button>
            <button
              className="ghost"
              disabled={busy}
              title="Generate PR Description"
              onClick={(e) => {
                e.stopPropagation();
                onGeneratePr(branch.name);
              }}
            >
              📝
            </button>
          </>
        )}
        {!branch.isHead && (
          <button
            className="ghost"
            disabled={busy}
            title="Check out"
            onClick={() => run((path) => git.checkout(path, branch.name))}
          >
            ⇥
          </button>
        )}
        {!branch.isRemote && !branch.isHead && (
          <>
            <button
              className="ghost"
              disabled={busy}
              title="Rename"
              onClick={() => setRenaming(true)}
            >
              ✎
            </button>
            <button
              className="ghost"
              disabled={busy}
              title="Merge into current branch"
              onClick={() => run((path) => git.mergeBranch(path, branch.name))}
            >
              ⤵
            </button>
            <button
              className="ghost danger"
              disabled={busy}
              title="Delete branch"
              onClick={() => {
                if (confirm(`Delete branch ${branch.name}?`)) {
                  run((path) => git.deleteBranch(path, branch.name, false));
                }
              }}
            >
              ⨯
            </button>
          </>
        )}
      </span>
    </li>
  );
}

export default function BranchPanel({ filter = "" }) {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const branches = useRepoStore((s) => s.repos[activeRepoId]?.branches || []);
  const busy = useRepoStore((s) => s.busy);
  const run = useRepoStore((s) => s.run);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [explainBranch, setExplainBranch] = useState(null);
  const [prBranch, setPrBranch] = useState(null);
  const [localExpanded, setLocalExpanded] = useState(true);
  const [remoteExpanded, setRemoteExpanded] = useState(true);

  const query = filter.trim().toLowerCase();
  const allLocal = branches.filter((b) => !b.isRemote);
  const allRemote = branches.filter((b) => b.isRemote);

  const local = query ? allLocal.filter((b) => b.name.toLowerCase().includes(query)) : allLocal;
  const remote = query ? allRemote.filter((b) => b.name.toLowerCase().includes(query)) : allRemote;

  const submitCreate = async (event) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const ok = await run((path) => git.checkoutNewBranch(path, trimmed, null));
    if (ok) {
      setNewName("");
      setCreating(false);
    }
  };

  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header clickable"
        onClick={() => setLocalExpanded((open) => !open)}
      >
        <div className="section-label-group">
          <span className="caret-icon">{localExpanded ? "∨" : "›"}</span>
          <span className="section-icon">💻</span>
          <span className="section-label">
            LOCAL ({local.length}/{allLocal.length})
          </span>
        </div>
        <button
          className="ghost icon-btn-boxed"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            setCreating((open) => !open);
          }}
          title="Create new branch"
        >
          +
        </button>
      </div>

      {localExpanded && creating && (
        <form className="branch-create" onSubmit={submitCreate}>
          <input
            type="text"
            autoFocus
            placeholder="New branch name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
        </form>
      )}

      {localExpanded && (
        <ul className="sidebar-list">
          {local.map((branch) => (
            <BranchRow
              key={branch.name}
              branch={branch}
              busy={busy}
              run={run}
              onExplainBranch={(b) => setExplainBranch(b)}
              onGeneratePr={(b) => setPrBranch(b)}
            />
          ))}
        </ul>
      )}

      {allRemote.length > 0 && (
        <>
          <div
            className="sidebar-section-header clickable"
            onClick={() => setRemoteExpanded((open) => !open)}
          >
            <div className="section-label-group">
              <span className="caret-icon">{remoteExpanded ? "∨" : "›"}</span>
              <span className="section-icon">☁️</span>
              <span className="section-label">
                REMOTE ({remote.length}/{allRemote.length})
              </span>
            </div>
          </div>
          {remoteExpanded && (
            <ul className="sidebar-list">
              {remote.map((branch) => (
                <BranchRow
                  key={branch.name}
                  branch={branch}
                  busy={busy}
                  run={run}
                  onExplainBranch={(b) => setExplainBranch(b)}
                  onGeneratePr={(b) => setPrBranch(b)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {explainBranch && (
        <ExplainBranchModal branch={explainBranch} onClose={() => setExplainBranch(null)} />
      )}

      {prBranch && <PrDescriptionModal branch={prBranch} onClose={() => setPrBranch(null)} />}
    </div>
  );
}
