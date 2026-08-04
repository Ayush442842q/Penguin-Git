use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};

/// Event name emitted to the frontend when a repository changes on disk.
///
/// This replaces polling entirely: the old prototype re-ran every git command
/// on a 6-second `setInterval` regardless of whether anything had changed.
pub const REPO_CHANGED_EVENT: &str = "repo-changed";

/// How long to wait for the filesystem to settle before emitting.
///
/// A single `git commit` touches `.git/index`, `.git/HEAD`, and several refs in
/// quick succession; without debouncing the UI would refresh four or five times
/// for one logical operation.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// Directories that hold build/dependency output, not source.
///
/// A single blanket `RecursiveMode::Recursive` watch on the whole repo used to
/// include these — on any repo with an active build (`cargo build` writing
/// continuously into `target/`, `pnpm install` populating `node_modules/`),
/// the resulting flood of inotify events pegs a CPU core and can make the
/// whole app appear to hang.
const EXCLUDED_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    "vendor",
    ".next",
    ".nuxt",
    "out",
    ".cache",
    ".turbo",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChanged {
    /// Identifies which repository changed, so a multi-repo UI (Phase 3) can
    /// refresh only the affected one.
    pub repo_id: String,
}

/// Watches a repository and invokes `on_change` when it changes on disk.
///
/// Dropping the returned handle stops the watcher.
pub struct RepoWatcher {
    _watcher: Arc<Mutex<notify::RecommendedWatcher>>,
}

impl RepoWatcher {
    /// Starts watching `repo_path`.
    ///
    /// `.git` is watched narrowly — just the top-level files (`HEAD`, `index`,
    /// `packed-refs`, ...) and `refs/` recursively, never `objects/` — and the
    /// working tree is walked and watched directory-by-directory, skipping
    /// [`EXCLUDED_DIR_NAMES`]. New directories are picked up as they're
    /// created (unless excluded) so a `git checkout` of a new branch or an
    /// `mkdir` still gets watched. Events are filtered and debounced on a
    /// background thread before `on_change` fires.
    pub fn start<F>(repo_path: &Path, on_change: F) -> notify::Result<Self>
    where
        F: Fn() + Send + 'static,
    {
        let (tx, rx) = mpsc::channel::<Event>();

        let watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                // A closed receiver just means the watcher is shutting down.
                let _ = tx.send(event);
            }
        })?;
        let watcher = Arc::new(Mutex::new(watcher));

        let git_dir = repo_path.join(".git");
        watch_git_dir(&watcher, &git_dir)?;
        watch_tree(&watcher, repo_path, &git_dir);

        let watcher_for_thread = Arc::clone(&watcher);
        std::thread::spawn(move || debounce_loop(rx, git_dir, watcher_for_thread, on_change));

        Ok(Self { _watcher: watcher })
    }
}

fn watch_git_dir(
    watcher: &Arc<Mutex<notify::RecommendedWatcher>>,
    git_dir: &Path,
) -> notify::Result<()> {
    if !git_dir.is_dir() {
        return Ok(());
    }
    let mut w = watcher.lock().unwrap();
    // HEAD, index, packed-refs, MERGE_HEAD, REBASE_HEAD all live directly here.
    w.watch(git_dir, RecursiveMode::NonRecursive)?;
    let refs = git_dir.join("refs");
    if refs.is_dir() {
        w.watch(&refs, RecursiveMode::Recursive)?;
    }
    Ok(())
}

/// Recursively watches `dir`, one directory at a time, skipping `.git` (handled
/// separately by [`watch_git_dir`]) and [`EXCLUDED_DIR_NAMES`].
fn watch_tree(watcher: &Arc<Mutex<notify::RecommendedWatcher>>, dir: &Path, git_dir: &Path) {
    {
        let mut w = watcher.lock().unwrap();
        let _ = w.watch(dir, RecursiveMode::NonRecursive);
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path == *git_dir || path.is_symlink() || !path.is_dir() {
            continue;
        }
        if is_excluded_dir(&path) {
            continue;
        }
        watch_tree(watcher, &path, git_dir);
    }
}

fn is_excluded_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|name| EXCLUDED_DIR_NAMES.contains(&name))
}

/// Extends watches to cover directories created after startup (e.g. a fresh
/// `git checkout` or `mkdir`), so they aren't silently unwatched.
fn watch_new_dirs(event: &Event, watcher: &Arc<Mutex<notify::RecommendedWatcher>>, git_dir: &Path) {
    if !matches!(event.kind, EventKind::Create(_)) {
        return;
    }
    for path in &event.paths {
        if path.starts_with(git_dir) || path.is_symlink() || !path.is_dir() {
            continue;
        }
        if is_excluded_dir(path) {
            continue;
        }
        watch_tree(watcher, path, git_dir);
    }
}

/// Collapses a burst of filesystem events into a single callback.
///
/// Waits for a first relevant event, then keeps draining until the filesystem
/// has been quiet for [`DEBOUNCE`], so one git operation produces one refresh.
fn debounce_loop<F: Fn()>(
    rx: mpsc::Receiver<Event>,
    git_dir: PathBuf,
    watcher: Arc<Mutex<notify::RecommendedWatcher>>,
    on_change: F,
) {
    while let Ok(event) = rx.recv() {
        watch_new_dirs(&event, &watcher, &git_dir);

        if !is_relevant(&event, &git_dir) {
            continue;
        }
        let deadline = Instant::now() + DEBOUNCE;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            match rx.recv_timeout(remaining) {
                Ok(event) => {
                    watch_new_dirs(&event, &watcher, &git_dir);
                    continue;
                }
                // Quiet for the full window, or the sender is gone.
                Err(_) => break,
            }
        }

        on_change();
    }
}

/// Filters out churn that doesn't represent a real repository change.
///
/// Without this, git's own lock files and object writes would each trigger a
/// refresh — and worse, the refresh itself can touch the repo, producing a
/// feedback loop that never settles.
fn is_relevant(event: &Event, git_dir: &Path) -> bool {
    // Pure access (open/read) events carry no information about a repo
    // actually changing — only mutations do. Watch registration itself can
    // generate these, so without this check a watcher could refresh on
    // nothing but its own setup.
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event
        .paths
        .iter()
        .any(|path| is_relevant_path(path, git_dir))
}

fn is_relevant_path(path: &Path, git_dir: &Path) -> bool {
    // Lock files appear and vanish around every git write.
    if path.extension().is_some_and(|ext| ext == "lock") {
        return false;
    }

    let Ok(relative) = path.strip_prefix(git_dir) else {
        // Outside .git — a working tree edit, which is always relevant.
        return true;
    };

    let first = relative
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .unwrap_or_default();

    match first.as_str() {
        // The refs, index, and HEAD are exactly what the UI reflects.
        "HEAD" | "index" | "refs" | "packed-refs" | "MERGE_HEAD" | "REBASE_HEAD" => true,
        // Object writes are an implementation detail of a commit we'll hear
        // about via the ref update anyway; logs are append-only noise.
        "objects" | "logs" | "modules" | "hooks" | "info" => false,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn ignores_lock_files_and_object_writes() {
        let git_dir = Path::new("/repo/.git");

        assert!(!is_relevant_path(
            Path::new("/repo/.git/index.lock"),
            git_dir
        ));
        assert!(!is_relevant_path(
            Path::new("/repo/.git/objects/ab/cdef123"),
            git_dir
        ));
        assert!(!is_relevant_path(
            Path::new("/repo/.git/logs/HEAD"),
            git_dir
        ));
    }

    #[test]
    fn tracks_refs_head_index_and_worktree_edits() {
        let git_dir = Path::new("/repo/.git");

        assert!(is_relevant_path(Path::new("/repo/.git/HEAD"), git_dir));
        assert!(is_relevant_path(Path::new("/repo/.git/index"), git_dir));
        assert!(is_relevant_path(
            Path::new("/repo/.git/refs/heads/main"),
            git_dir
        ));
        assert!(is_relevant_path(Path::new("/repo/src/main.rs"), git_dir));
    }

    #[test]
    fn merge_and_rebase_state_files_are_tracked() {
        // These appear and vanish around a conflicted merge or an interactive
        // rebase — exactly the moments the UI most needs to redraw.
        let git_dir = Path::new("/repo/.git");

        assert!(is_relevant_path(
            Path::new("/repo/.git/MERGE_HEAD"),
            git_dir
        ));
        assert!(is_relevant_path(
            Path::new("/repo/.git/REBASE_HEAD"),
            git_dir
        ));
        assert!(is_relevant_path(
            Path::new("/repo/.git/packed-refs"),
            git_dir
        ));
        assert!(is_relevant_path(
            Path::new("/repo/.git/refs/tags/v1.0.0"),
            git_dir
        ));
    }

    #[test]
    fn internal_git_bookkeeping_is_ignored() {
        // Anything not explicitly listed is treated as noise. Refreshing on
        // config writes or hook edits would fire constantly for no visible change,
        // and the refresh itself can touch the repo — a loop that never settles.
        let git_dir = Path::new("/repo/.git");

        for noise in [
            "/repo/.git/config",
            "/repo/.git/COMMIT_EDITMSG",
            "/repo/.git/hooks/pre-commit",
            "/repo/.git/info/exclude",
            "/repo/.git/modules/sub/HEAD",
            "/repo/.git/refs/heads/main.lock",
            "/repo/.git/ORIG_HEAD",
        ] {
            assert!(
                !is_relevant_path(Path::new(noise), git_dir),
                "{noise} should not trigger a refresh"
            );
        }
    }

    #[test]
    fn lock_files_are_ignored_wherever_they_appear() {
        let git_dir = Path::new("/repo/.git");

        assert!(!is_relevant_path(
            Path::new("/repo/.git/HEAD.lock"),
            git_dir
        ));
        assert!(
            !is_relevant_path(Path::new("/repo/src/build.lock"), git_dir),
            "a lock file in the worktree is churn too"
        );
    }

    #[test]
    fn an_event_is_relevant_if_any_of_its_paths_is() {
        // A rename event carries both the source and the destination; ignoring it
        // because the first path was a lock file would drop the real change.
        let git_dir = Path::new("/repo/.git");
        let noise_only = Event::default().add_path(PathBuf::from("/repo/.git/index.lock"));
        let mixed = Event::default()
            .add_path(PathBuf::from("/repo/.git/index.lock"))
            .add_path(PathBuf::from("/repo/.git/index"));

        assert!(!is_relevant(&noise_only, git_dir));
        assert!(is_relevant(&mixed, git_dir));
        assert!(
            !is_relevant(&Event::default(), git_dir),
            "an event with no paths tells us nothing"
        );
    }

    #[test]
    fn pure_access_events_are_never_relevant() {
        // Regression test: watch registration itself (and unrelated readers,
        // like a search indexer) can generate Access(Open/Close) events even
        // on paths that otherwise look relevant (e.g. `.git/refs`). Without
        // filtering by EventKind, a watcher could refresh on nothing but
        // someone reading a directory.
        let git_dir = Path::new("/repo/.git");
        let access_on_head = Event::new(EventKind::Access(notify::event::AccessKind::Open(
            notify::event::AccessMode::Any,
        )))
        .add_path(PathBuf::from("/repo/.git/HEAD"));

        assert!(!is_relevant(&access_on_head, git_dir));
    }

    #[test]
    fn a_repo_nested_inside_another_is_matched_by_its_own_git_dir() {
        // `strip_prefix` is what separates "inside .git" from "in the worktree";
        // a path merely *containing* `.git` as text must not be misread.
        let git_dir = Path::new("/repo/.git");

        assert!(
            is_relevant_path(Path::new("/repo/docs/.gitignore"), git_dir),
            "a worktree file whose name starts with .git is still a worktree file"
        );
        assert!(
            is_relevant_path(Path::new("/other-repo/.git/objects/ab/cd"), git_dir),
            "a different repository's internals are outside this one's .git"
        );
    }

    #[test]
    fn a_commit_produces_exactly_one_debounced_callback() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");

        let hits = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&hits);
        let _watcher = RepoWatcher::start(repo.path(), move || {
            counter.fetch_add(1, Ordering::SeqCst);
        })
        .expect("watcher should start");

        // Let the watcher register before making changes.
        std::thread::sleep(Duration::from_millis(150));

        // One logical operation that touches the index, HEAD, and refs.
        repo.write("a.txt", "hello");
        repo.git(&["add", "a.txt"]);
        repo.commit_all("A commit");

        // Long enough for the debounce window to close.
        std::thread::sleep(DEBOUNCE + Duration::from_millis(600));

        let count = hits.load(Ordering::SeqCst);
        assert!(count >= 1, "the watcher should have fired at least once");
        assert!(
            count <= 3,
            "a single commit should debounce into roughly one refresh, got {count}"
        );
    }

    #[test]
    fn excluded_build_directories_are_never_watched() {
        // Regression test: a blanket recursive watch on the whole repo used to
        // include build/dependency directories. On a repo with an active build
        // continuously writing into `target/`, that flooded inotify and pegged
        // a CPU core badly enough to make the whole app appear to hang.
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        std::fs::create_dir_all(repo.path().join("target/debug")).unwrap();

        let hits = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&hits);
        let _watcher = RepoWatcher::start(repo.path(), move || {
            counter.fetch_add(1, Ordering::SeqCst);
        })
        .expect("watcher should start");

        std::thread::sleep(Duration::from_millis(150));

        for i in 0..20 {
            std::fs::write(repo.path().join(format!("target/debug/churn-{i}.tmp")), "x").unwrap();
        }

        std::thread::sleep(DEBOUNCE + Duration::from_millis(600));

        assert_eq!(
            hits.load(Ordering::SeqCst),
            0,
            "writes inside an excluded build directory must never trigger a refresh"
        );
    }
}
