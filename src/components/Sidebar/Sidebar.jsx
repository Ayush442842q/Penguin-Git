import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import BranchPanel from "./BranchPanel";
import StashPanel from "./StashPanel";
import "./Sidebar.css";

import SubmodulePanel from "../SubmodulePanel/SubmodulePanel";
import PatchPanel from "../PatchPanel/PatchPanel";
import CloudPatches from "../CloudPatches/CloudPatches";
import "./Sidebar.css";

export default function Sidebar() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const busy = useRepoStore((s) => s.busy);
  const run = useRepoStore((s) => s.run);

  const [filterText, setFilterText] = useState("");
  const [showRemotes, setShowRemotes] = useState(false);
  const [showPatchModal, setShowPatchModal] = useState(false);
  const [showCloudPatches, setShowCloudPatches] = useState(false);

  if (!slice || !slice.repo) return null;
  const repo = slice.repo;
  const remotes = slice.remotes || [];
  const status = slice.status;

  const githubToken = localStorage.getItem("penguingit:github-token");

  return (
    <aside className="sidebar panel">
      <div className="panel-header">
        <span className="section-label truncate" title={repo.path}>
          {repo.name}
        </span>
      </div>

      <div className="sidebar-filter-bar">
        <input
          type="search"
          className="sidebar-filter-input"
          placeholder="Filter branches & remotes…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      <div className="sidebar-scroll">
        <BranchPanel filter={filterText} />
        <StashPanel />
        <SubmodulePanel />

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-label">Integrations</span>
          </div>
          <div className="sidebar-integration-row">
            <span className="integration-icon">🐙</span>
            <span className="integration-name">GitHub Token</span>
            <span className={`badge ${githubToken ? "badge-green" : "badge-orange"}`}>
              {githubToken ? "Connected" : "Not Set"}
            </span>
          </div>
        </div>

        <div className="sidebar-section">
          <button className="ghost sidebar-section-toggle" onClick={() => setShowPatchModal(true)}>
            <span className="section-label">📄 Share via File (Patch)</span>
          </button>
          <button
            className="ghost sidebar-section-toggle"
            onClick={() => setShowCloudPatches(true)}
          >
            <span className="section-label">☁️ Cloud Patches</span>
          </button>
        </div>

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
      <PatchPanel isOpen={showPatchModal} onClose={() => setShowPatchModal(false)} />
      <CloudPatches
        isOpen={showCloudPatches}
        onClose={() => setShowCloudPatches(false)}
        activeRepoPath={repo.path}
      />
    </aside>
  );
}
