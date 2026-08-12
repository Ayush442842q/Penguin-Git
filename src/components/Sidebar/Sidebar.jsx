import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import BranchPanel from "./BranchPanel";
import StashPanel from "./StashPanel";
import SubmodulePanel from "../SubmodulePanel/SubmodulePanel";
import PatchPanel from "../PatchPanel/PatchPanel";
import CloudPatches from "../CloudPatches/CloudPatches";
import "./Sidebar.css";

export default function Sidebar() {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);

  const [filterText, setFilterText] = useState("");
  const [showRemotes, setShowRemotes] = useState(false);
  const [showPatchModal, setShowPatchModal] = useState(false);
  const [showCloudPatches, setShowCloudPatches] = useState(false);

  if (!slice || !slice.repo) return null;
  const repo = slice.repo;
  const remotes = slice.remotes || [];

  const query = filterText.trim().toLowerCase();
  const filteredRemotes = query
    ? remotes.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          (r.fetchUrl && r.fetchUrl.toLowerCase().includes(query))
      )
    : remotes;

  const githubToken = localStorage.getItem("penguingit:github-token");

  const remotesLabel = query
    ? `Remotes (${filteredRemotes.length}/${remotes.length})`
    : `Remotes (${remotes.length})`;

  return (
    <aside className="sidebar panel">
      <div className="panel-header sidebar-top-header">
        <div className="sidebar-viewing-bar">
          <button className="ghost icon-btn sidebar-back-btn" title="Back">
            ‹
          </button>
          <span className="sidebar-viewing-text" title={repo.path}>
            <span className="sidebar-repo-title">{repo.name}</span> Viewing{" "}
            <span className="viewing-count">101/101</span>
          </span>
        </div>
        <button className="ghost text-btn sidebar-show-all">Show All</button>
      </div>

      <div className="sidebar-filter-bar">
        <div className="sidebar-filter-wrapper">
          <input
            type="search"
            className="sidebar-filter-input"
            placeholder="Filter (Ctrl + Alt + f)"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <span className="filter-search-icon">🔍</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        <BranchPanel filter={filterText} />
        <StashPanel />
        <SubmodulePanel />

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-label">PULL REQUESTS</span>
            <button className="ghost" title="New Pull Request">
              +
            </button>
          </div>
          <div className="sidebar-search-box">
            <input
              type="search"
              placeholder="Search pull requests…"
              className="sidebar-sub-input"
            />
          </div>
          <ul className="sidebar-list">
            <li className="sidebar-row sub-row">
              <span className="truncate">My Pull Requests</span>
              <span className="badge badge-dim">0</span>
            </li>
            <li className="sidebar-row sub-row">
              <span className="truncate">Assigned To Me</span>
              <span className="badge badge-dim">0</span>
            </li>
            <li className="sidebar-row sub-row">
              <span className="truncate">Awaiting My Review</span>
              <span className="badge badge-dim">0</span>
            </li>
            <li className="sidebar-row sub-row">
              <span className="truncate">All Pull Requests</span>
              <span className="badge badge-dim">0</span>
            </li>
          </ul>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-label">GITHUB ISSUES</span>
          </div>
          <div className="sidebar-select-wrapper">
            <select className="sidebar-select">
              <option value="">Select repository…</option>
              <option value={repo.name}>{repo.name}</option>
            </select>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-label">TEAMS</span>
          </div>
          <div className="sidebar-select-wrapper">
            <select className="sidebar-select">
              <option value="Docs Team">Docs Team</option>
            </select>
          </div>
          <ul className="sidebar-list">
            <li className="sidebar-row user-row">
              <span className="user-avatar-initials">AL</span>
              <span className="truncate">Alex L</span>
            </li>
            <li className="sidebar-row user-row">
              <span className="user-avatar-initials">DL</span>
              <span className="truncate">Diane Lo</span>
            </li>
            <li className="sidebar-row user-row">
              <span className="user-avatar-initials">DM</span>
              <span className="truncate">Dwayne McDaniel</span>
            </li>
          </ul>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-label">TAGS (1/1)</span>
            <button className="ghost" title="Create Tag">
              +
            </button>
          </div>
          <ul className="sidebar-list">
            <li className="sidebar-row">
              <span className="truncate">🏷️ v1.1.1</span>
            </li>
          </ul>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="section-label">GITHUB ACTIONS (0)</span>
          </div>
        </div>

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
            <span className="section-label">{remotesLabel}</span>
            <span className="text-dim">{showRemotes ? "−" : "+"}</span>
          </button>
          {showRemotes && (
            <ul className="sidebar-list">
              {filteredRemotes.length === 0 && (
                <li className="sidebar-empty text-muted">
                  {remotes.length === 0 ? "No remotes." : "No matching remotes."}
                </li>
              )}
              {filteredRemotes.map((remote) => (
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
