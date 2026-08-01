import { useEffect, useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import { WIP_ROW_HASH } from "../CommitGraph/CommitGraph";
import "./DiffViewer.css";

const TABS = [
  { id: "diff", label: "Diff" },
  { id: "history", label: "History" },
  { id: "blame", label: "Blame" },
];

/** Classifies a unified-diff line for colouring. */
function lineClass(line) {
  if (line.startsWith("+++") || line.startsWith("---")) return "diff-meta";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "diff-meta";
  return "diff-context";
}

function UnifiedDiff({ text }) {
  if (!text?.trim()) return <p className="diff-empty text-muted">No changes to show.</p>;

  return (
    <pre className="diff-body">
      {text.split("\n").map((line, index) => (
        <div key={index} className={`diff-line ${lineClass(line)}`}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function formatDate(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Per-line authorship.
 *
 * Line-level annotations only — a visual heat map is explicitly out of scope
 * for this phase.
 */
function BlameView({ lines }) {
  if (!lines?.length) return <p className="diff-empty text-muted">No blame data.</p>;

  return (
    <div className="blame-body">
      {lines.map((line) => (
        <div key={line.lineNumber} className="blame-line">
          <span className="blame-hash mono text-dim" title={line.summary}>
            {line.hash.slice(0, 7)}
          </span>
          <span className="blame-author truncate text-muted">{line.authorName}</span>
          <span className="blame-date text-dim">{formatDate(line.timestamp)}</span>
          <span className="blame-number text-dim">{line.lineNumber}</span>
          <pre className="blame-content">{line.content || " "}</pre>
        </div>
      ))}
    </div>
  );
}

function HistoryView({ commits, onSelect }) {
  if (!commits?.length) return <p className="diff-empty text-muted">No history for this file.</p>;

  return (
    <ul className="history-list">
      {commits.map((commit) => (
        <li key={commit.hash} className="history-row" onClick={() => onSelect(commit.hash)}>
          <span className="history-hash mono text-dim">{commit.shortHash}</span>
          <span className="history-subject truncate">{commit.subject}</span>
          <span className="history-author truncate text-muted">{commit.authorName}</span>
          <span className="history-date text-dim">{formatDate(commit.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DiffViewer() {
  const repo = useRepoStore((s) => s.repo);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const selectCommit = useRepoStore((s) => s.selectCommit);

  const [tab, setTab] = useState("diff");

  /**
   * Loaded content tagged with the selection it belongs to.
   *
   * Kept as one object rather than separate `diff`/`history`/`blame` pieces so
   * the render can check `key` and simply not show content belonging to a
   * previous selection — which is what removes the need to synchronously clear
   * state inside the effect (a cascading-render pattern React warns about).
   */
  const [content, setContent] = useState({ key: null, diff: "", history: [], blame: [] });

  // File and commit selection are mutually exclusive views; whichever changed
  // last is what the panel shows.
  const target = selectedFile
    ? { kind: "file", ...selectedFile }
    : selectedCommit && selectedCommit !== WIP_ROW_HASH
      ? { kind: "commit", hash: selectedCommit }
      : null;
  const targetKey = target ? `${tab}:${JSON.stringify(target)}` : null;

  useEffect(() => {
    if (!repo || !targetKey) return;

    let cancelled = false;
    const selection = JSON.parse(targetKey.slice(targetKey.indexOf(":") + 1));

    const load = async () => {
      try {
        if (selection.kind === "commit") {
          const diff = await git.getCommitDiff(repo.path, selection.hash);
          if (!cancelled) setContent({ key: targetKey, diff, history: [], blame: [] });
          return;
        }

        if (tab === "diff") {
          const diff = selection.untracked
            ? await git.getUntrackedDiff(repo.path, selection.path)
            : await git.getFileDiff(repo.path, selection.path, selection.staged);
          if (!cancelled) setContent({ key: targetKey, diff, history: [], blame: [] });
        } else if (tab === "history") {
          const history = await git.getFileHistory(repo.path, selection.path);
          if (!cancelled) setContent({ key: targetKey, diff: "", history, blame: [] });
        } else if (tab === "blame") {
          const blame = await git.getBlame(repo.path, selection.path);
          if (!cancelled) setContent({ key: targetKey, diff: "", history: [], blame });
        }
      } catch (err) {
        if (!cancelled) {
          setContent({ key: targetKey, diff: "", history: [], blame: [], error: String(err) });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [repo, targetKey, tab]);

  // Only content loaded for the current selection is shown; anything else is
  // still in flight.
  const fresh = content.key === targetKey ? content : null;
  const error = fresh?.error ?? null;

  if (!target) {
    return (
      <div className="diff-viewer panel">
        <div className="panel-header">
          <span className="section-label">Diff</span>
        </div>
        <p className="diff-empty text-muted">Select a commit or a file to see its changes.</p>
      </div>
    );
  }

  const isFile = target.kind === "file";

  return (
    <div className="diff-viewer panel">
      <div className="panel-header">
        <span className="section-label truncate">
          {isFile ? target.path : `Commit ${target.hash.slice(0, 7)}`}
        </span>
        {isFile && (
          <div className="diff-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`ghost${tab === t.id ? " active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="diff-scroll">
        {error ? (
          <p className="diff-empty" style={{ color: "var(--accent-red)" }}>
            {error}
          </p>
        ) : !fresh ? (
          <p className="diff-empty text-muted">Loading…</p>
        ) : !isFile || tab === "diff" ? (
          <UnifiedDiff text={fresh.diff} />
        ) : tab === "history" ? (
          <HistoryView commits={fresh.history} onSelect={selectCommit} />
        ) : (
          <BlameView lines={fresh.blame} />
        )}
      </div>
    </div>
  );
}
