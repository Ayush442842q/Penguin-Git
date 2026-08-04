import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import {
  exportPatch,
  previewPatch,
  applyPatch,
  savePatchFile,
  pickPatchFile,
  writePatchFile,
} from "../../services/tauriBridge";
import "./PatchPanel.css";

export default function PatchPanel({ isOpen, onClose }) {
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const activeRepoPath = useRepoStore((s) => s.repos[activeRepoId]?.repo?.path);

  const [activeTab, setActiveTab] = useState("export");
  const [commitRange, setCommitRange] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!activeRepoPath) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const exported = await exportPatch(activeRepoPath, commitRange.trim() || undefined);
      if (!exported.content || !exported.content.trim()) {
        setStatusMessage({ type: "error", text: "No changes to export." });
        setLoading(false);
        return;
      }
      const savePath = await savePatchFile(exported.suggestedName);
      if (savePath) {
        await writePatchFile(savePath, exported.content);
        setStatusMessage({
          type: "success",
          text: `✓ Patch exported successfully to ${savePath}`,
        });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Export failed: ${err.message || String(err)}` });
    } finally {
      setLoading(false);
    }
  };

  const handlePickFileToImport = async () => {
    if (!activeRepoPath) return;
    setStatusMessage(null);
    setPreview(null);
    try {
      const filePath = await pickPatchFile();
      if (!filePath) return;
      // Read file content
      // Using standard fetch file:// or FileReader if user picked via file input, or read via tauri.
      // Let's allow either file picker or raw text input!
      setLoading(true);
      // If we read via fetch(filePath):
      const res = await fetch(`https://asset.localhost/${encodeURIComponent(filePath)}`).catch(
        async () => {
          // fallback if file protocol
          const response = await window.fetch(`file://${filePath}`);
          return response.text();
        }
      );
      const text = typeof res === "string" ? res : await res.text();
      const prev = await previewPatch(activeRepoPath, text);
      setPreview({ ...prev, rawContent: text, fileName: filePath.split("/").pop() });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: `Failed to load patch: ${err.message || String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPatch = async () => {
    if (!activeRepoPath || !preview?.rawContent) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const result = await applyPatch(activeRepoPath, preview.rawContent);
      setStatusMessage({ type: "success", text: `✓ ${result}` });
      setPreview(null);
      useRepoStore.getState().refreshRepo(activeRepoId);
    } catch (err) {
      setStatusMessage({ type: "error", text: `Apply failed: ${err.message || String(err)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="patch-overlay" onClick={onClose}>
      <div className="patch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="patch-header">
          <div>
            <h2>Share via File (Local Patch)</h2>
            <p className="patch-subtitle">
              Export/Import <code>.patch</code> files locally with zero network requirement.
            </p>
          </div>
          <button className="patch-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="patch-body">
          <div className="patch-tabs">
            <button
              className={`patch-tab ${activeTab === "export" ? "active" : ""}`}
              onClick={() => setActiveTab("export")}
            >
              📤 Export Patch
            </button>
            <button
              className={`patch-tab ${activeTab === "import" ? "active" : ""}`}
              onClick={() => setActiveTab("import")}
            >
              📥 Import Patch
            </button>
          </div>

          {statusMessage && (
            <div className={`patch-status ${statusMessage.type}`}>{statusMessage.text}</div>
          )}

          {activeTab === "export" && (
            <div className="patch-section">
              <label htmlFor="patch-range-input">Commit Range (Optional)</label>
              <input
                id="patch-range-input"
                type="text"
                className="patch-input"
                placeholder="e.g. HEAD~1..HEAD (leave empty for uncommitted working tree changes)"
                value={commitRange}
                onChange={(e) => setCommitRange(e.target.value)}
              />
              <p className="text-dim text-sm">
                Exports a standard Git patch file. If empty, exports unstaged + staged changes.
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={loading || !activeRepoPath}
                onClick={handleExport}
              >
                {loading ? "Exporting…" : "Export .patch File"}
              </button>
            </div>
          )}

          {activeTab === "import" && (
            <div className="patch-section">
              <div className="import-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loading || !activeRepoPath}
                  onClick={handlePickFileToImport}
                >
                  📁 Select .patch File
                </button>
              </div>

              {preview && (
                <div className="patch-preview">
                  <h4>Preview: {preview.fileName}</h4>
                  <div className={`preview-badge ${preview.appliesCleanly ? "clean" : "conflict"}`}>
                    {preview.appliesCleanly
                      ? "✓ Applies cleanly"
                      : `❌ Conflict: ${preview.checkError || "Does not apply"}`}
                  </div>
                  {preview.stat && <pre className="patch-stat">{preview.stat}</pre>}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={loading || !preview.appliesCleanly}
                    onClick={handleApplyPatch}
                  >
                    {loading ? "Applying…" : "Apply Patch"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
