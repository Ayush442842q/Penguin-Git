import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRepoStore } from "../../store/repoStore";
import * as git from "../../services/tauriBridge";
import CommitContextMenu from "./CommitContextMenu";
import "./CommitGraph.css";

const ROW_HEIGHT = 34;
const LANE_WIDTH = 14;
const LANE_ORIGIN = 12;
const DOT_RADIUS = 4;
const BRANCH_COLORS = 8;

/** Hash of the synthesized row representing uncommitted work. */
export const WIP_ROW_HASH = "__wip__";

const laneX = (lane) => LANE_ORIGIN + lane * LANE_WIDTH;
const laneColor = (lane) => `var(--branch-${lane % BRANCH_COLORS})`;

function formatTimestamp(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Matches a commit against the filter box.
 *
 * Searches subject, author, and hash together so one box covers the three
 * things people actually look commits up by.
 */
function matchesFilter(commit, needle) {
  if (!needle) return true;
  const haystack = [commit.subject, commit.authorName, commit.hash, ...(commit.refs || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Draws the lane lines for one row.
 *
 * The Rust lane algorithm hands us `incoming`/`outgoing` lane slots plus any
 * `mergedFrom` lanes, so this renders topology it is given rather than
 * re-deriving parentage in the browser.
 */
function RowGraphics({ row, isWip }) {
  if (!row) return null;

  const x = laneX(row.lane);
  const mid = ROW_HEIGHT / 2;

  const lines = [];
  const incomingLanes = new Set((row.incoming || []).map((slot) => slot.lane));
  const outgoingLanes = new Set((row.outgoing || []).map((slot) => slot.lane));

  // Each lane touching this row is drawn exactly once, according to whether it
  // arrives from above, continues below, or both.
  for (const lane of new Set([...incomingLanes, ...outgoingLanes])) {
    const arrives = incomingLanes.has(lane);
    const continues = outgoingLanes.has(lane);
    const lx = laneX(lane);

    if (lane === row.lane) {
      // The commit's own lane: stops at the dot on whichever side it's absent.
      lines.push(
        <line
          key={`lane-${lane}`}
          x1={lx}
          y1={arrives ? 0 : mid}
          x2={lx}
          y2={continues ? ROW_HEIGHT : mid}
          stroke={laneColor(lane)}
          strokeWidth="1.5"
        />
      );
    } else if (arrives && continues) {
      // Unrelated branch passing straight through, behind this row.
      lines.push(
        <line
          key={`lane-${lane}`}
          x1={lx}
          y1={0}
          x2={lx}
          y2={ROW_HEIGHT}
          stroke={laneColor(lane)}
          strokeWidth="1.5"
        />
      );
    } else if (continues) {
      // A lane this commit opens — a merge's second parent. It has to fan out
      // of the dot, not drop in from above as though it existed already.
      lines.push(
        <path
          key={`lane-${lane}`}
          d={`M ${x} ${mid} C ${x} ${ROW_HEIGHT}, ${lx} ${mid}, ${lx} ${ROW_HEIGHT}`}
          fill="none"
          stroke={laneColor(lane)}
          strokeWidth="1.5"
        />
      );
    }
    // `arrives && !continues` is a lane terminating at this commit, drawn below
    // as a mergedFrom curve.
  }

  // Side branches converging into this commit, drawn as a curve so merges read
  // as joins rather than as an unrelated line that happens to stop here.
  for (const lane of row.mergedFrom || []) {
    const from = laneX(lane);
    lines.push(
      <path
        key={`merge-${lane}`}
        d={`M ${from} 0 C ${from} ${mid}, ${x} ${mid}, ${x} ${mid}`}
        fill="none"
        stroke={laneColor(lane)}
        strokeWidth="1.5"
      />
    );
  }

  return (
    <>
      {lines}
      {isWip ? (
        <circle
          cx={x}
          cy={mid}
          r={DOT_RADIUS}
          fill="var(--bg-base)"
          stroke={laneColor(row.lane)}
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
      ) : (
        <circle cx={x} cy={mid} r={DOT_RADIUS} fill={laneColor(row.lane)} />
      )}
    </>
  );
}

function RefBadge({ name }) {
  const isTag = name.startsWith("tag: ");
  const isHead = name.startsWith("HEAD");
  const label = isTag ? name.slice(5) : name;
  const tone = isTag ? "badge-orange" : isHead ? "badge-purple" : "badge-cyan";
  return <span className={`badge ${tone}`}>{label}</span>;
}

export default function CommitGraph() {
  const commits = useRepoStore((s) => s.commits);
  const layout = useRepoStore((s) => s.layout);
  const status = useRepoStore((s) => s.status);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const run = useRepoStore((s) => s.run);

  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState(null);
  const scrollRef = useRef(null);

  const hasUncommittedWork =
    !!status &&
    (status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0);

  /**
   * Commits joined to their lane assignments, with a synthesized WIP row on top
   * when the working tree is dirty — so uncommitted work occupies a place in
   * the graph rather than living only in a side panel.
   */
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const byHash = new Map((layout.rows || []).map((r) => [r.hash, r]));

    const commitRows = commits
      .filter((commit) => matchesFilter(commit, needle))
      .map((commit) => ({ commit, row: byHash.get(commit.hash), isWip: false }));

    // The WIP row hangs off the current tip, so hide it while filtering —
    // it has no subject or author to match against.
    if (!hasUncommittedWork || needle) return commitRows;

    const tipRow = layout.rows?.[0];
    const wipRow = {
      hash: WIP_ROW_HASH,
      lane: tipRow?.lane ?? 0,
      incoming: [],
      outgoing: tipRow ? [{ lane: tipRow.lane, target: tipRow.hash }] : [],
      mergedFrom: [],
    };
    const changeCount = status.staged.length + status.unstaged.length + status.untracked.length;

    return [
      {
        isWip: true,
        row: wipRow,
        commit: {
          hash: WIP_ROW_HASH,
          shortHash: "",
          subject: `Uncommitted changes (${changeCount})`,
          authorName: "",
          timestamp: 0,
          refs: [],
        },
      },
      ...commitRows,
    ];
  }, [commits, layout, filter, hasUncommittedWork, status]);

  // React Compiler warns that it can't memoize a component using this hook,
  // because `useVirtualizer` returns functions. That's inherent to the library
  // and expected here — virtualization is what keeps a 500-commit graph from
  // rendering 500 rows. The warning is informational, not a defect to suppress.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const graphWidth = LANE_ORIGIN * 2 + Math.max(layout.laneCount || 1, 1) * LANE_WIDTH;

  const handleContextMenu = useCallback((event, entry) => {
    event.preventDefault();
    if (entry.isWip) return;
    setMenu({ x: event.clientX, y: event.clientY, commit: entry.commit });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const runOnCommit = useCallback(
    (operation) => {
      const commit = menu?.commit;
      closeMenu();
      if (commit) run((repoPath) => operation(repoPath, commit));
    },
    [menu, run, closeMenu]
  );

  return (
    <div className="commit-graph panel">
      <div className="panel-header">
        <span className="section-label">Commit Graph</span>
        <input
          type="search"
          className="graph-filter"
          placeholder="Filter by message, author, or hash…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div className="graph-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <p className="graph-empty text-muted">
            {filter ? "No commits match that filter." : "No commits yet."}
          </p>
        ) : (
          <div className="graph-rows" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = rows[virtualRow.index];
              const { commit, row, isWip } = entry;
              const isSelected = selectedCommit === commit.hash;

              return (
                <div
                  key={commit.hash}
                  className={`graph-row${isSelected ? " selected" : ""}${isWip ? " wip" : ""}`}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => selectCommit(commit.hash)}
                  onContextMenu={(event) => handleContextMenu(event, entry)}
                >
                  <svg
                    className="graph-lanes"
                    width={graphWidth}
                    height={ROW_HEIGHT}
                    aria-hidden="true"
                  >
                    <RowGraphics row={row} isWip={isWip} />
                  </svg>

                  <span className="graph-subject truncate">
                    {(commit.refs || []).map((ref) => (
                      <RefBadge key={ref} name={ref} />
                    ))}
                    {commit.subject}
                  </span>
                  <span className="graph-author truncate text-muted">{commit.authorName}</span>
                  <span className="graph-date text-dim">{formatTimestamp(commit.timestamp)}</span>
                  <span className="graph-hash mono text-dim">{commit.shortHash}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {menu && (
        <CommitContextMenu
          x={menu.x}
          y={menu.y}
          commit={menu.commit}
          onClose={closeMenu}
          onCherryPick={() => runOnCommit((path, c) => git.cherryPick(path, c.hash))}
          onRevert={() => runOnCommit((path, c) => git.revertCommit(path, c.hash))}
          onReset={(mode) => runOnCommit((path, c) => git.resetToCommit(path, c.hash, mode))}
          onTag={(name) => runOnCommit((path, c) => git.createTag(path, name, c.hash, null))}
          onBranch={(name) => runOnCommit((path, c) => git.checkoutNewBranch(path, name, c.hash))}
        />
      )}
    </div>
  );
}
