import { useState, useEffect } from "react";
import {
  cloudListPatches,
  cloudListComments,
  cloudAddComment,
  applyPatch,
  previewPatch,
} from "../../services/tauriBridge";
import "./CloudPatches.css";

export default function CloudPatches({ activeRepoPath, isOpen, onClose, onPreviewPatch }) {
  const [patches, setPatches] = useState([]);
  const [selectedPatch, setSelectedPatch] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applyStatus, setApplyStatus] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    async function fetchPatches() {
      setLoading(true);
      setError("");
      try {
        const data = await cloudListPatches();
        if (active) {
          setPatches(data || []);
          if (data && data.length > 0) {
            setSelectedPatch(data[0]);
          }
        }
      } catch (err) {
        if (active) {
          setError(typeof err === "string" ? err : "Failed to load cloud patches. Are you logged in?");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchPatches();
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!selectedPatch) return;

    let active = true;
    async function fetchComments() {
      try {
        const data = await cloudListComments(selectedPatch.id);
        if (active) {
          setComments(data || []);
        }
      } catch (err) {
        console.error("Failed to load comments:", err);
      }
    }
    fetchComments();
    return () => {
      active = false;
    };
  }, [selectedPatch]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedPatch) return;

    try {
      const comment = await cloudAddComment(selectedPatch.id, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to post comment");
    }
  };

  const handleApplyPatch = async () => {
    if (!selectedPatch || !activeRepoPath) {
      setError("No active repository selected to apply patch");
      return;
    }

    setApplyStatus("Applying patch...");
    try {
      await applyPatch(activeRepoPath, selectedPatch.patchData);
      setApplyStatus("Patch applied successfully!");
    } catch (err) {
      setApplyStatus("");
      setError(`Apply failed: ${err}`);
    }
  };

  const handlePreviewPatch = async () => {
    if (!selectedPatch || !activeRepoPath) {
      setError("No active repository selected");
      return;
    }

    try {
      const stats = await previewPatch(activeRepoPath, selectedPatch.patchData);
      if (onPreviewPatch) {
        onPreviewPatch(selectedPatch.patchData, stats);
        onClose();
      }
    } catch (err) {
      setError(`Preview failed: ${err}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cloud-patches-overlay" onClick={onClose}>
      <div className="cloud-patches-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cloud-patches-header">
          <h2>☁️ Cloud Patches</h2>
          <button className="cloud-patches-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {error && <div className="cloud-patches-alert">{error}</div>}

        <div className="cloud-patches-body">
          <div className="cloud-patches-list">
            <h3>Shared Patches</h3>
            {loading ? (
              <div className="cloud-patches-loading">Loading patches...</div>
            ) : patches.length === 0 ? (
              <div className="cloud-patches-empty">No patches shared yet.</div>
            ) : (
              patches.map((p) => (
                <div
                  key={p.id}
                  className={`cloud-patch-item ${selectedPatch?.id === p.id ? "selected" : ""}`}
                  onClick={() => setSelectedPatch(p)}
                >
                  <div className="cloud-patch-title">{p.title}</div>
                  <div className="cloud-patch-meta">
                    {p.repoName && <span className="cloud-patch-repo">{p.repoName}</span>}
                    <span className="cloud-patch-date">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cloud-patch-detail">
            {selectedPatch ? (
              <>
                <div className="cloud-patch-detail-header">
                  <h3>{selectedPatch.title}</h3>
                  <div className="cloud-patch-actions">
                    <button className="cp-btn cp-btn-secondary" onClick={handlePreviewPatch}>
                      Preview Patch
                    </button>
                    <button className="cp-btn cp-btn-primary" onClick={handleApplyPatch}>
                      Apply to Active Repo
                    </button>
                  </div>
                </div>

                {applyStatus && <div className="cloud-patches-success">{applyStatus}</div>}

                {selectedPatch.description && (
                  <p className="cloud-patch-description">{selectedPatch.description}</p>
                )}

                <div className="cloud-patch-preview-box">
                  <pre>{selectedPatch.patchData.slice(0, 1000)}...</pre>
                </div>

                <div className="cloud-patch-comments-section">
                  <h4>Comments ({comments.length})</h4>
                  <div className="cloud-comments-list">
                    {comments.map((c) => (
                      <div key={c.id} className="cloud-comment-item">
                        <div className="cloud-comment-header">
                          <span className="cloud-comment-author">User {c.authorId.slice(0, 8)}</span>
                          <span className="cloud-comment-time">
                            {new Date(c.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="cloud-comment-body">{c.body}</div>
                      </div>
                    ))}
                  </div>

                  <form className="cloud-comment-form" onSubmit={handleAddComment}>
                    <input
                      type="text"
                      className="cloud-comment-input"
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                    <button type="submit" className="cp-btn cp-btn-secondary">
                      Comment
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="cloud-patches-empty">Select a patch to view details</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
