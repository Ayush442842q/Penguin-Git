import { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import "./StagingPanel.css";

const KIND_LABEL = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechanged: "T",
  untracked: "?",
  conflicted: "!",
};

function FileRow({ entry, section, onSelect, isSelected, actions }) {
  return (
    <li
      className={`file-row${isSelected ? " selected" : ""}`}
      onClick={() => onSelect(entry, section)}
    >
      <span className={`file-kind kind-${entry.kind}`}>{KIND_LABEL[entry.kind] ?? "?"}</span>
      <span className="file-path truncate" title={entry.path}>
        {entry.originalPath ? `${entry.originalPath} → ${entry.path}` : entry.path}
      </span>
      <span className="file-actions">{actions}</span>
    </li>
  );
}

function Section({ title, entries, children }) {
  if (entries.length === 0) return null;
  return (
    <div className="staging-section">
      <div className="staging-section-header">
        <span className="section-label">
          {title} ({entries.length})
        </span>
      </div>
      <ul className="file-list">{children}</ul>
    </div>
  );
}

export default function StagingPanel() {
  const status = useRepoStore((s) => s.status);
  const busy = useRepoStore((s) => s.busy);
  const run = useRepoStore((s) => s.run);
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const selectFile = useRepoStore((s) => s.selectFile);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [amend, setAmend] = useState(false);

  if (!status) return null;

  const { staged, unstaged, untracked, conflicted } = status;
  const canCommit = subject.trim().length > 0 && (staged.length > 0 || amend) && !busy;

  const handleSelect = (entry, section) => {
    selectFile({
      path: entry.path,
      staged: section === "staged",
      untracked: section === "untracked",
    });
  };

  const handleCommit = async (event) => {
    event.preventDefault();
    if (!canCommit) return;
    const ok = await run((repoPath) => git.commitChanges(repoPath, subject.trim(), body, amend));
    if (ok) {
      setSubject("");
      setBody("");
      setAmend(false);
    }
  };

  const isSelected = (entry, section) =>
    selectedFile?.path === entry.path && selectedFile?.staged === (section === "staged");

  return (
    <div className="staging-panel panel">
      <div className="panel-header">
        <span className="section-label">Changes</span>
        {(unstaged.length > 0 || untracked.length > 0) && (
          <button className="ghost" disabled={busy} onClick={() => run(git.stageAll)}>
            Stage all
          </button>
        )}
      </div>

      <div className="staging-scroll">
        {conflicted.length > 0 && (
          <Section title="Conflicted" entries={conflicted}>
            {conflicted.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                section="unstaged"
                onSelect={handleSelect}
                isSelected={isSelected(entry, "unstaged")}
                actions={
                  <button
                    className="ghost"
                    disabled={busy}
                    title="Mark resolved by staging"
                    onClick={(e) => {
                      e.stopPropagation();
                      run((repoPath) => git.stageFile(repoPath, entry.path));
                    }}
                  >
                    Resolve
                  </button>
                }
              />
            ))}
          </Section>
        )}

        <Section title="Staged" entries={staged}>
          {staged.map((entry) => (
            <FileRow
              key={`staged-${entry.path}`}
              entry={entry}
              section="staged"
              onSelect={handleSelect}
              isSelected={isSelected(entry, "staged")}
              actions={
                <button
                  className="ghost"
                  disabled={busy}
                  title="Unstage"
                  onClick={(e) => {
                    e.stopPropagation();
                    run((repoPath) => git.unstageFile(repoPath, entry.path));
                  }}
                >
                  −
                </button>
              }
            />
          ))}
        </Section>

        <Section title="Unstaged" entries={unstaged}>
          {unstaged.map((entry) => (
            <FileRow
              key={`unstaged-${entry.path}`}
              entry={entry}
              section="unstaged"
              onSelect={handleSelect}
              isSelected={isSelected(entry, "unstaged")}
              actions={
                <>
                  <button
                    className="ghost danger"
                    disabled={busy}
                    title="Discard changes — this cannot be undone"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Discard all changes to ${entry.path}? This cannot be undone.`)) {
                        run((repoPath) => git.discardFileChanges(repoPath, entry.path));
                      }
                    }}
                  >
                    ⨯
                  </button>
                  <button
                    className="ghost"
                    disabled={busy}
                    title="Stage"
                    onClick={(e) => {
                      e.stopPropagation();
                      run((repoPath) => git.stageFile(repoPath, entry.path));
                    }}
                  >
                    +
                  </button>
                </>
              }
            />
          ))}
        </Section>

        <Section title="Untracked" entries={untracked}>
          {untracked.map((entry) => (
            <FileRow
              key={`untracked-${entry.path}`}
              entry={entry}
              section="untracked"
              onSelect={handleSelect}
              isSelected={isSelected(entry, "untracked")}
              actions={
                <>
                  <button
                    className="ghost danger"
                    disabled={busy}
                    title="Delete file — this cannot be undone"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${entry.path}? This cannot be undone.`)) {
                        run((repoPath) => git.discardUntracked(repoPath, entry.path));
                      }
                    }}
                  >
                    ⨯
                  </button>
                  <button
                    className="ghost"
                    disabled={busy}
                    title="Stage"
                    onClick={(e) => {
                      e.stopPropagation();
                      run((repoPath) => git.stageFile(repoPath, entry.path));
                    }}
                  >
                    +
                  </button>
                </>
              }
            />
          ))}
        </Section>

        {status.staged.length === 0 &&
          status.unstaged.length === 0 &&
          status.untracked.length === 0 &&
          status.conflicted.length === 0 && (
            <p className="staging-clean text-muted">Working tree clean.</p>
          )}
      </div>

      <form className="commit-box" onSubmit={handleCommit}>
        <input
          type="text"
          placeholder="Commit message"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <textarea
          rows="3"
          placeholder="Extended description (optional)"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="commit-box-actions">
          <label className="amend-toggle">
            <input
              type="checkbox"
              checked={amend}
              onChange={(event) => setAmend(event.target.checked)}
            />
            Amend last commit
          </label>
          <button type="submit" className="primary" disabled={!canCommit}>
            Commit {staged.length > 0 ? `(${staged.length})` : ""}
          </button>
        </div>
      </form>
    </div>
  );
}
