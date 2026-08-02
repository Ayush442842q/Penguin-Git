import { useState, useEffect } from "react";
import * as git from "../../services/tauriBridge";
import { useRepoStore } from "../../store/repoStore";
import "./AiModals.css";

export default function PrDescriptionModal({ branch, target = "main", onClose }) {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const repo = slice?.repo;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!branch || !repo) return;
    let cancelled = false;

    const generatePR = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await git.aiGeneratePrDescription(repo.path, branch, target);
        if (!cancelled && res) {
          setTitle(res.title || "");
          setBody(res.body || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    generatePR();

    return () => {
      cancelled = true;
    };
  }, [branch, target, repo]);

  if (!branch) return null;

  const handleCopy = () => {
    const fullText = `# ${title}\n\n${body}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-header">
          <h3>
            📝 Generate PR Description ({branch} → {target})
          </h3>
          <button className="settings-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="ai-modal-body">
          {loading ? (
            <div>Generating Pull Request title and description with AI…</div>
          ) : error ? (
            <div style={{ color: "var(--accent-red, #f87171)" }}>Error: {error}</div>
          ) : (
            <>
              <div className="ai-modal-field">
                <label htmlFor="pr-title-input">PR Title</label>
                <input
                  id="pr-title-input"
                  type="text"
                  className="ai-modal-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="ai-modal-field">
                <label htmlFor="pr-body-input">PR Markdown Body</label>
                <textarea
                  id="pr-body-input"
                  className="ai-modal-textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="ai-modal-footer">
          {copied && <span className="copy-toast">✓ Title & Description copied</span>}
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || (!title && !body)}
            onClick={handleCopy}
          >
            Copy PR Markdown
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
