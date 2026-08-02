import { useEffect, useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import "./ConflictEditor.css";

export function ConflictEditor({ path }) {
  const { repo, operationState, refresh, closeConflictEditor } = useRepoStore();

  const [stages, setStages] = useState({
    base: "",
    ours: "",
    theirs: "",
    hasBase: false,
    hasOurs: false,
    hasTheirs: false,
  });

  const [resolvedContent, setResolvedContent] = useState("");
  const [saving, setSaving] = useState(false);

  const conflictedPaths = operationState?.conflictedPaths || [];
  const activePath = path || conflictedPaths[0];

  useEffect(() => {
    if (!repo || !activePath) return;

    let mounted = true;
    git
      .readConflictStages(repo.id, activePath)
      .then((data) => {
        if (!mounted) return;
        setStages({
          base: data.base || "",
          ours: data.ours || "",
          theirs: data.theirs || "",
          hasBase: data.hasBase ?? data.has_base ?? false,
          hasOurs: data.hasOurs ?? data.has_ours ?? false,
          hasTheirs: data.hasTheirs ?? data.has_theirs ?? false,
        });

        // Default resolved preview to ours if present, else theirs
        setResolvedContent(data.ours || data.theirs || data.base || "");
      })
      .catch((err) => console.error("Failed to read conflict stages:", err));

    return () => {
      mounted = false;
    };
  }, [repo, activePath]);

  const handlePickOurs = () => setResolvedContent(stages.ours);
  const handlePickTheirs = () => setResolvedContent(stages.theirs);
  const handlePickBase = () => setResolvedContent(stages.base);

  const handleSaveResolution = async () => {
    if (!repo || !activePath) return;
    setSaving(true);
    try {
      // Must both write content AND execute git add
      await git.resolveConflict(repo.id, activePath, resolvedContent);
      await refresh();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    if (!repo) return;
    try {
      await git.continueOperation(repo.id);
      await refresh();
      closeConflictEditor();
    } catch (err) {
      console.error("Failed to continue operation:", err);
    }
  };

  const handleAbort = async () => {
    if (!repo) return;
    try {
      await git.abortOperation(repo.id);
      await refresh();
      closeConflictEditor();
    } catch (err) {
      console.error("Failed to abort operation:", err);
    }
  };

  const handleSkip = async () => {
    if (!repo) return;
    try {
      await git.skipRebase(repo.id);
      await refresh();
      closeConflictEditor();
    } catch (err) {
      console.error("Failed to skip rebase:", err);
    }
  };

  const isRebase = operationState?.kind === "rebase";
  const remainingCount = conflictedPaths.length;
  const canContinue = remainingCount === 0;

  return (
    <div className="conflict-editor-container" data-testid="conflict-editor">
      <div className="conflict-banner">
        <div className="conflict-banner-info">
          <span className="conflict-badge">{operationState?.kind || "Conflict"}</span>
          <span className="conflict-count">
            {remainingCount === 0
              ? "All conflicts resolved! Ready to continue."
              : `${remainingCount} file${remainingCount === 1 ? "" : "s"} with conflicts remaining`}
          </span>
        </div>
        <div className="conflict-actions">
          {isRebase && (
            <button className="btn btn-secondary" onClick={handleSkip}>
              Skip
            </button>
          )}
          <button className="btn btn-danger" onClick={handleAbort}>
            Abort
          </button>
          <button
            className="btn btn-primary"
            disabled={!canContinue}
            onClick={handleContinue}
            data-testid="continue-btn"
          >
            Continue
          </button>
        </div>
      </div>

      {conflictedPaths.length > 0 && (
        <div className="conflict-tabs">
          {conflictedPaths.map((p) => (
            <button
              key={p}
              className={`conflict-tab ${p === activePath ? "active" : ""}`}
              onClick={() => useRepoStore.getState().openConflictEditor(p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {activePath ? (
        <div className="panes-grid">
          <div className="pane">
            <div className="pane-header ours">
              <span>Ours (Current)</span>
              <button className="pick-btn" onClick={handlePickOurs}>
                Pick Ours
              </button>
            </div>
            <pre className="pane-content">{stages.ours}</pre>
          </div>

          <div className="pane">
            <div className="pane-header base">
              <span>Base (Ancestor)</span>
              <button className="pick-btn" onClick={handlePickBase}>
                Pick Base
              </button>
            </div>
            <pre className="pane-content">{stages.base}</pre>
          </div>

          <div className="pane">
            <div className="pane-header theirs">
              <span>Theirs (Incoming)</span>
              <button className="pick-btn" onClick={handlePickTheirs}>
                Pick Theirs
              </button>
            </div>
            <pre className="pane-content">{stages.theirs}</pre>
          </div>

          <div className="pane pane-resolved">
            <div className="pane-header resolved">
              <span>Resolved Result</span>
              <button
                className="btn btn-primary"
                onClick={handleSaveResolution}
                disabled={saving}
                data-testid="save-resolution-btn"
              >
                {saving ? "Staging..." : "Save & Stage Resolution"}
              </button>
            </div>
            <textarea
              className="pane-content"
              value={resolvedContent}
              onChange={(e) => setResolvedContent(e.target.value)}
              placeholder="Edit resolved content here..."
            />
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, textAlign: "center" }}>
          No active conflict selected. Click Continue above to finish the operation.
        </div>
      )}
    </div>
  );
}
