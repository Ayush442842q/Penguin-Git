import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import BranchPanel from "./BranchPanel";
import StashPanel from "./StashPanel";
import "./Sidebar.css";

import SubmodulePanel from "../SubmodulePanel/SubmodulePanel";
import "./Sidebar.css";

export default function Sidebar() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const busy = useRepoStore((s) => s.busy);
  const run = useRepoStore((s) => s.run);

  const [showRemotes, setShowRemotes] = useState(false);

  if (!slice || !slice.repo) return null;
  const repo = slice.repo;
  const remotes = slice.remotes || [];
  const status = slice.status;

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const hasUpstream = !!status?.upstream;

  return (
    <aside className="sidebar panel">
      <div className="panel-header">
        <span className="section-label truncate" title={repo.path}>
          {repo.name}
        </span>
      </div>

      <div className="sidebar-scroll">
        <div className="remote-actions">
          <button disabled={busy} onClick={() => run((path) => git.fetch(path, null))}>
            Fetch
          </button>
          <button disabled={busy} onClick={() => run(git.pull)}>
            Pull {behind > 0 && <span className="badge badge-blue">{behind}</span>}
          </button>
          <button
            disabled={busy}
            title={hasUpstream ? "Push to upstream" : "Push and set upstream"}
            onClick={() =>
              run((path) =>
                git.push(
                  path,
                  hasUpstream ? null : "origin",
                  hasUpstream ? null : status?.branch,
                  !hasUpstream
                )
              )
            }
          >
            Push {ahead > 0 && <span className="badge badge-green">{ahead}</span>}
          </button>
        </div>

        <BranchPanel />
        <StashPanel />
        <SubmodulePanel />

        <div className="sidebar-section">
          <button
            className="ghost sidebar-section-toggle"
            onClick={() => setShowRemotes((open) => !open)}
          >
            <span className="section-label">Remotes ({remotes.length})</span>
            <span className="text-dim">{showRemotes ? "−" : "+"}</span>
          </button>
          {showRemotes && (
            <ul className="sidebar-list">
              {remotes.length === 0 && <li className="sidebar-empty text-muted">No remotes.</li>}
              {remotes.map((remote) => (
                <li key={remote.name} className="sidebar-row">
                  <span className="truncate">{remote.name}</span>
                  <span className="truncate text-dim" title={remote.fetchUrl}>
                    {remote.fetchUrl}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
