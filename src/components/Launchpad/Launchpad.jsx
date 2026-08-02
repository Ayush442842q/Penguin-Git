import { useState, useEffect, useCallback } from "react";
import { useRepoStore } from "../../store/repoStore";
import {
  getGithubToken,
  getRepoOrigin,
  githubGetLaunchpadItems,
  githubCreatePr,
  startWorkOnIssue,
  getBranches,
} from "../../services/tauriBridge";
import Settings from "../Settings/Settings";
import "./Launchpad.css";

export default function Launchpad({ isOpen, onClose }) {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const activeRepoPath = slice?.repo?.path;
  const currentBranch = slice?.status?.branch || "main";
  const reloadRepo = useRepoStore((s) => s.loadRepo);

  const [hasToken, setHasToken] = useState(false);
  const [originInfo, setOriginInfo] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [startingWorkNumber, setStartingWorkNumber] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Create PR modal state
  const [showCreatePrModal, setShowCreatePrModal] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("main");
  const [availableBranches, setAvailableBranches] = useState([]);
  const [creatingPr, setCreatingPr] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!activeRepoPath) return;
    setError(null);
    try {
      const token = await getGithubToken();
      setHasToken(!!token);
      if (!token) {
        setLoading(false);
        return;
      }

      const origin = await getRepoOrigin(activeRepoPath);
      setOriginInfo(origin);

      const launchpadItems = await githubGetLaunchpadItems(activeRepoPath);
      setItems(launchpadItems || []);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [activeRepoPath]);

  useEffect(() => {
    if (!isOpen && onClose) return;
    const timer = setTimeout(() => {
      fetchItems();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, onClose, fetchItems]);

  // Polling interval every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasToken && activeRepoPath) {
        fetchItems();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [hasToken, activeRepoPath, fetchItems]);

  const handleStartWork = async (issueNumber, issueTitle) => {
    if (!activeRepoPath) return;
    setStartingWorkNumber(issueNumber);
    setToastMessage(null);
    try {
      const branchName = await startWorkOnIssue(activeRepoPath, issueNumber, issueTitle);
      if (activeRepoId) {
        await reloadRepo(activeRepoPath);
      }
      setToastMessage({
        type: "success",
        text: `✓ Created & checked out branch "${branchName}"!`,
      });
      // Optionally close launchpad modal to return to repo view
      if (onClose) {
        setTimeout(() => onClose(), 1200);
      }
    } catch (err) {
      setToastMessage({
        type: "error",
        text: `Failed to start work on issue: ${err.message || String(err)}`,
      });
    } finally {
      setStartingWorkNumber(null);
    }
  };

  const handleOpenCreatePrModal = async () => {
    setPrHead(currentBranch);
    setPrBase("main");
    setPrTitle("");
    setPrBody("");
    setShowCreatePrModal(true);

    if (activeRepoPath) {
      try {
        const branches = await getBranches(activeRepoPath);
        setAvailableBranches(branches.map((b) => b.name));
      } catch {
        setAvailableBranches([currentBranch, "main"]);
      }
    }
  };

  const handleCreatePrSubmit = async (e) => {
    e.preventDefault();
    if (!activeRepoPath || !prTitle.trim() || !prHead) return;
    setCreatingPr(true);
    try {
      await githubCreatePr(activeRepoPath, prTitle, prBody, prHead, prBase);
      setShowCreatePrModal(false);
      setToastMessage({
        type: "success",
        text: `✓ Pull Request "${prTitle}" created successfully!`,
      });
      await fetchItems();
    } catch (err) {
      setToastMessage({
        type: "error",
        text: `Failed to create PR: ${err.message || String(err)}`,
      });
    } finally {
      setCreatingPr(false);
    }
  };

  if (isOpen === false) return null;

  const needsReviewPrs = items.filter((i) => i.kind === "pr" && i.category === "Needs review");
  const yourPrs = items.filter((i) => i.kind === "pr" && i.category === "Your PRs");
  const readyToMergePrs = items.filter((i) => i.kind === "pr" && i.category === "Ready to merge");
  const openIssues = items.filter((i) => i.kind === "issue" || i.category === "Issues");

  return (
    <div className={onClose ? "launchpad-overlay" : "launchpad-page"}>
      <div className={onClose ? "launchpad-modal" : "launchpad-container"}>
        <div className="launchpad-header">
          <div className="launchpad-header-left">
            <h2>🚀 Launchpad</h2>
            {originInfo && (
              <span className="launchpad-repo-badge">
                🐙 {originInfo.owner} / {originInfo.repo}
              </span>
            )}
          </div>
          <div className="launchpad-header-actions">
            <button
              className="btn-secondary"
              disabled={loading || !hasToken}
              onClick={fetchItems}
              title="Refresh inbox"
            >
              {loading ? "Refreshing…" : "🔄 Refresh"}
            </button>
            <button
              className="btn-primary"
              disabled={!hasToken || !originInfo}
              onClick={handleOpenCreatePrModal}
              title="Create Pull Request"
            >
              ➕ Create PR
            </button>
            {onClose && (
              <button className="launchpad-close-btn" onClick={onClose} title="Close Launchpad">
                ✕
              </button>
            )}
          </div>
        </div>

        {toastMessage && (
          <div className={`launchpad-toast ${toastMessage.type}`}>{toastMessage.text}</div>
        )}

        {!hasToken && (
          <div className="launchpad-banner warning">
            <span>🔑 GitHub Personal Access Token is required to access Launchpad.</span>
            <button className="btn-secondary" onClick={() => setShowSettings(true)}>
              Open Settings
            </button>
          </div>
        )}

        {error && <div className="launchpad-banner error">Error loading items: {error}</div>}

        <div className="launchpad-content">
          {/* Group 1: Needs Review */}
          <div className="launchpad-category">
            <div className="category-header">
              <h3>👀 Needs Review ({needsReviewPrs.length})</h3>
            </div>
            <div className="item-list">
              {needsReviewPrs.length === 0 ? (
                <div className="empty-state">No PRs waiting for your review.</div>
              ) : (
                needsReviewPrs.map((pr) => <ItemCard key={pr.number} item={pr} />)
              )}
            </div>
          </div>

          {/* Group 2: Your PRs */}
          <div className="launchpad-category">
            <div className="category-header">
              <h3>📝 Your Pull Requests ({yourPrs.length})</h3>
            </div>
            <div className="item-list">
              {yourPrs.length === 0 ? (
                <div className="empty-state">You have no open pull requests.</div>
              ) : (
                yourPrs.map((pr) => <ItemCard key={pr.number} item={pr} />)
              )}
            </div>
          </div>

          {/* Group 3: Ready to Merge */}
          <div className="launchpad-category">
            <div className="category-header">
              <h3>✅ Ready to Merge ({readyToMergePrs.length})</h3>
            </div>
            <div className="item-list">
              {readyToMergePrs.length === 0 ? (
                <div className="empty-state">No PRs marked ready to merge.</div>
              ) : (
                readyToMergePrs.map((pr) => <ItemCard key={pr.number} item={pr} />)
              )}
            </div>
          </div>

          {/* Group 4: Open Issues */}
          <div className="launchpad-category">
            <div className="category-header">
              <h3>📌 Open Issues ({openIssues.length})</h3>
            </div>
            <div className="item-list">
              {openIssues.length === 0 ? (
                <div className="empty-state">No open issues found.</div>
              ) : (
                openIssues.map((issue) => (
                  <ItemCard
                    key={issue.number}
                    item={issue}
                    onStartWork={() => handleStartWork(issue.number, issue.title)}
                    isStartingWork={startingWorkNumber === issue.number}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create PR Modal */}
      {showCreatePrModal && (
        <div className="modal-overlay" onClick={() => setShowCreatePrModal(false)}>
          <form
            className="create-pr-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreatePrSubmit}
          >
            <div className="modal-header">
              <h3>Create Pull Request</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowCreatePrModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Head (Compare Branch)</label>
                  <select
                    className="launchpad-select"
                    value={prHead}
                    onChange={(e) => setPrHead(e.target.value)}
                  >
                    {availableBranches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Base (Target Branch)</label>
                  <select
                    className="launchpad-select"
                    value={prBase}
                    onChange={(e) => setPrBase(e.target.value)}
                  >
                    {availableBranches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="pr-title-input">Title</label>
                <input
                  id="pr-title-input"
                  type="text"
                  className="launchpad-input"
                  placeholder="Pull request title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="pr-body-input">Description</label>
                <textarea
                  id="pr-body-input"
                  className="launchpad-textarea"
                  placeholder="Describe your changes…"
                  rows={4}
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCreatePrModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={creatingPr || !prTitle.trim()}
              >
                {creatingPr ? "Creating PR…" : "Create PR"}
              </button>
            </div>
          </form>
        </div>
      )}

      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function ItemCard({ item, onStartWork, isStartingWork }) {
  return (
    <div className="item-card">
      <div className="item-card-main">
        <div className="item-title-row">
          <span className={`kind-badge ${item.kind}`}>
            {item.kind === "pr" ? "🔀 PR" : "📌 Issue"}
          </span>
          <span className="item-number">#{item.number}</span>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="item-title-link"
            title="View on GitHub"
          >
            {item.title}
          </a>
        </div>
        <div className="item-meta">
          <span>
            opened by <strong>@{item.author}</strong>
          </span>
          <span>·</span>
          <span>updated {new Date(item.updated_at).toLocaleDateString()}</span>
        </div>
      </div>

      {item.kind === "issue" && onStartWork && (
        <button
          className="btn-start-work"
          disabled={isStartingWork}
          onClick={onStartWork}
          title="Create & checkout feature branch from issue"
        >
          {isStartingWork ? "Creating branch…" : "🚀 Start Work on Issue"}
        </button>
      )}
    </div>
  );
}
