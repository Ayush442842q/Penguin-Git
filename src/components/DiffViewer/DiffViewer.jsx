import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

const DIFF_LINE_HEIGHT = 20;

/**
 * Unified diff, virtualized.
 *
 * A large commit runs to tens of thousands of lines. Rendering one element per
 * line builds that many DOM nodes in a single synchronous pass and freezes the
 * webview, so only the visible window is mounted — the same approach the commit
 * graph already uses.
 */
function UnifiedDiff({ text, filePath, canStageHunks, onStageHunk }) {
  const scrollRef = useRef(null);
  const lines = useMemo(() => (text ? text.split("\n") : []), [text]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DIFF_LINE_HEIGHT,
    overscan: 30,
  });

  const handleStageHunk = (lineIndex) => {
    if (!filePath || !onStageHunk) return;
    const hunkHeader = lines[lineIndex];
    const hunkLines = [];
    for (let i = lineIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith("@@") || lines[i].startsWith("diff ")) break;
      hunkLines.push(lines[i]);
    }

    // Extract headers dynamically from the original diff (lines from 0 to first @@)
    const headerLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("@@")) break;
      headerLines.push(lines[i]);
    }

    // Fallback to synthetic headers only if no header lines were found in the diff
    if (headerLines.length === 0) {
      headerLines.push(`diff --git a/${filePath} b/${filePath}`);
      headerLines.push(`--- a/${filePath}`);
      headerLines.push(`+++ b/${filePath}`);
    }

    const patch = [...headerLines, hunkHeader, ...hunkLines, ""].join("\n");
    onStageHunk(patch);
  };

  if (!text?.trim()) return <p className="diff-empty text-muted">No changes to show.</p>;

  return (
    <div className="diff-body" ref={scrollRef}>
      <div className="diff-virtual" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => {
          const line = lines[row.index];
          const isHunkHeader = line && line.startsWith("@@");
          return (
            <div
              key={row.index}
              className={`diff-line ${lineClass(line)}`}
              style={{ height: `${DIFF_LINE_HEIGHT}px`, transform: `translateY(${row.start}px)` }}
            >
              <span>{line || " "}</span>
              {canStageHunks && isHunkHeader && (
                <button
                  type="button"
                  className="hunk-stage-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageHunk(row.index);
                  }}
                  title="Stage this hunk"
                >
                  + Stage Hunk
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

const RELATIVE_UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 hours ago", falling back to "just now" under a minute. */
function formatRelativeTime(seconds) {
  if (!seconds) return "";
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "just now";

  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    const value = Math.floor(diff / unitSeconds);
    if (value >= 1) return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

const AVATAR_COLORS = ["#7c5cff", "#2fa4e7", "#20b8a3", "#e0a63a", "#e0573a", "#d24fa0", "#5b8def"];

/**
 * Deterministic initials-on-a-circle avatar, derived locally from the
 * author's identity.
 *
 * Not a Gravatar lookup: this app makes no network requests of its own
 * (see ARCHITECTURE.md), and a per-commit avatar keyed off the author's
 * email would be exactly that.
 */
function Avatar({ name, email }) {
  const seed = email || name || "?";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];

  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return (
    <div className="commit-avatar" style={{ backgroundColor: color }} title={name}>
      {initials || "?"}
    </div>
  );
}

/**
 * Commit metadata, message body, and per-file change stats — shown above the
 * diff when a commit (rather than a file) is selected. Clicking a file scopes
 * the diff below to just that file; clicking it again returns to the full
 * commit diff.
 */
function CommitDetail({ details, hash, selectedPath, onSelectFile }) {
  const [copied, setCopied] = useState(false);

  if (!details) return null;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(details.hash || hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="commit-detail">
      <div className="commit-detail-header">
        <Avatar name={details.authorName} email={details.authorEmail} />
        <div className="commit-detail-meta">
          <pre className="commit-detail-body">{details.body}</pre>
          <div className="commit-detail-byline text-muted">
            <span>{details.authorName}</span>
            <span title={formatDate(details.timestamp)}>
              committed {formatRelativeTime(details.timestamp)}
            </span>
          </div>
          {details.refs?.length > 0 && (
            <div className="commit-detail-refs">
              {details.refs.map((ref) => (
                <span key={ref} className="badge badge-purple">
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="ghost commit-hash-copy mono"
          onClick={handleCopyHash}
          title="Copy full hash"
        >
          {copied ? "Copied!" : (details.hash || hash).slice(0, 7)}
        </button>
      </div>

      {details.files?.length > 0 && (
        <ul className="commit-detail-files">
          {details.files.map((file) => {
            const total = (file.insertions ?? 0) + (file.deletions ?? 0);
            const addRatio = total > 0 ? (file.insertions ?? 0) / total : 0;
            return (
              <li
                key={file.path}
                className={`commit-detail-file${selectedPath === file.path ? " selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectFile(file.path)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectFile(file.path);
                  }
                }}
              >
                <span className="file-path truncate" title={file.path}>
                  {file.path}
                </span>
                {file.insertions == null ? (
                  <span className="text-dim">binary</span>
                ) : (
                  <>
                    <span className="commit-detail-stat-counts text-dim">
                      +{file.insertions} -{file.deletions}
                    </span>
                    <span className="commit-detail-stat-bar">
                      <span
                        className="commit-detail-stat-add"
                        style={{ width: `${addRatio * 100}%` }}
                      />
                      <span
                        className="commit-detail-stat-del"
                        style={{ width: `${(1 - addRatio) * 100}%` }}
                      />
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Per-line authorship.
 *
 * Line-level annotations only — a visual heat map is explicitly out of scope
 * for this phase.
 */
function BlameView({ lines }) {
  const scrollRef = useRef(null);

  // Same reasoning as UnifiedDiff — a long source file is just as unbounded.
  const virtualizer = useVirtualizer({
    count: lines?.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DIFF_LINE_HEIGHT,
    overscan: 30,
  });

  if (!lines?.length) return <p className="diff-empty text-muted">No blame data.</p>;

  return (
    <div className="blame-body" ref={scrollRef}>
      <div className="diff-virtual" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => {
          const line = lines[row.index];
          return (
            <div
              key={line.lineNumber}
              className="blame-line"
              style={{ height: `${DIFF_LINE_HEIGHT}px`, transform: `translateY(${row.start}px)` }}
            >
              <span className="blame-hash mono text-dim" title={line.summary}>
                {line.hash.slice(0, 7)}
              </span>
              <span className="blame-author truncate text-muted">{line.authorName}</span>
              <span className="blame-date text-dim">{formatDate(line.timestamp)}</span>
              <span className="blame-number text-dim">{line.lineNumber}</span>
              <pre className="blame-content">{line.content || " "}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryView({ commits, onSelect }) {
  if (!commits?.length) return <p className="diff-empty text-muted">No history for this file.</p>;

  return (
    <ul className="history-list">
      {commits.map((commit) => (
        <li
          key={commit.hash}
          className="history-row"
          role="button"
          tabIndex={0}
          onClick={() => onSelect(commit.hash)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(commit.hash);
            }
          }}
        >
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
  const activeRepoId = useRepoStore((s) => s.activeRepoId);
  const slice = useRepoStore((s) => s.repos[activeRepoId]);
  const repo = slice?.repo;
  const selectedCommit = slice?.selectedCommit;
  const selectedFile = slice?.selectedFile;
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
  const [content, setContent] = useState({
    key: null,
    diff: "",
    history: [],
    blame: [],
    details: null,
  });

  // Which file (if any) within the selected commit's file list is drilled
  // into. Reset below whenever the selected commit itself changes, so
  // switching commits doesn't leave a stale file scoping the new one's diff.
  const [commitFilePath, setCommitFilePath] = useState(null);
  const [resetForHash, setResetForHash] = useState(null);

  // File and commit selection are mutually exclusive views; whichever changed
  // last is what the panel shows.
  const target = selectedFile
    ? { kind: "file", ...selectedFile }
    : selectedCommit && selectedCommit !== WIP_ROW_HASH
      ? { kind: "commit", hash: selectedCommit }
      : null;
  const selectedCommitHash = target?.kind === "commit" ? target.hash : null;

  // Adjusting state during render rather than in an effect — the officially
  // recommended way to reset state when a prop-like value changes, since it
  // avoids the extra render an effect-based reset would cause.
  if (selectedCommitHash !== resetForHash) {
    setResetForHash(selectedCommitHash);
    setCommitFilePath(null);
  }

  const targetKey = target ? `${tab}:${commitFilePath ?? ""}:${JSON.stringify(target)}` : null;

  useEffect(() => {
    if (!repo || !targetKey) return;

    let cancelled = false;
    const selection = target;

    const load = async () => {
      try {
        if (selection.kind === "commit") {
          const [diff, details] = await Promise.all([
            commitFilePath
              ? git.getCommitFileDiff(repo.path, selection.hash, commitFilePath)
              : git.getCommitDiff(repo.path, selection.hash),
            git.getCommitDetails(repo.path, selection.hash),
          ]);
          if (!cancelled) setContent({ key: targetKey, diff, history: [], blame: [], details });
          return;
        }

        if (tab === "diff") {
          const diff = selection.untracked
            ? await git.getUntrackedDiff(repo.path, selection.path)
            : await git.getFileDiff(repo.path, selection.path, selection.staged);
          if (!cancelled)
            setContent({ key: targetKey, diff, history: [], blame: [], details: null });
        } else if (tab === "history") {
          const history = await git.getFileHistory(repo.path, selection.path);
          if (!cancelled)
            setContent({ key: targetKey, diff: "", history, blame: [], details: null });
        } else if (tab === "blame") {
          const blame = await git.getBlame(repo.path, selection.path);
          if (!cancelled)
            setContent({ key: targetKey, diff: "", history: [], blame, details: null });
        }
      } catch (err) {
        if (!cancelled) {
          setContent({
            key: targetKey,
            diff: "",
            history: [],
            blame: [],
            details: null,
            error: String(err),
          });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `target` is derived fresh each render; targetKey already captures its identity
  }, [repo, targetKey, tab, commitFilePath]);

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
          <>
            {!isFile && (
              <CommitDetail
                details={fresh.details}
                hash={target.hash}
                selectedPath={commitFilePath}
                onSelectFile={(path) =>
                  setCommitFilePath((current) => (current === path ? null : path))
                }
              />
            )}
            <UnifiedDiff
              text={fresh.diff}
              filePath={isFile ? target.path : null}
              canStageHunks={isFile && !target.staged}
              onStageHunk={(patch) => useRepoStore.getState().stageHunk(patch)}
            />
          </>
        ) : tab === "history" ? (
          <HistoryView commits={fresh.history} onSelect={selectCommit} />
        ) : (
          <BlameView lines={fresh.blame} />
        )}
      </div>
    </div>
  );
}
