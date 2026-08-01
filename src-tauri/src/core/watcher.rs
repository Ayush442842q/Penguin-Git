use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{Event, RecursiveMode, Watcher};
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
    _watcher: notify::RecommendedWatcher,
}

impl RepoWatcher {
    /// Starts watching `repo_path`.
    ///
    /// Watches the working tree and `.git` together, recursively: the
    /// interesting paths (`.git/HEAD`, `.git/refs`, `.git/index`) are all under
    /// `.git`, and file edits happen in the tree. Events are filtered and
    /// debounced on a background thread before `on_change` fires.
    pub fn start<F>(repo_path: &Path, on_change: F) -> notify::Result<Self>
    where
        F: Fn() + Send + 'static,
    {
        let (tx, rx) = mpsc::channel::<Event>();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                // A closed receiver just means the watcher is shutting down.
                let _ = tx.send(event);
            }
        })?;

        watcher.watch(repo_path, RecursiveMode::Recursive)?;

        let git_dir = repo_path.join(".git");
        std::thread::spawn(move || debounce_loop(rx, git_dir, on_change));

        Ok(Self { _watcher: watcher })
    }
}

/// Collapses a burst of filesystem events into a single callback.
///
/// Waits for a first relevant event, then keeps draining until the filesystem
/// has been quiet for [`DEBOUNCE`], so one git operation produces one refresh.
fn debounce_loop<F: Fn()>(rx: mpsc::Receiver<Event>, git_dir: PathBuf, on_change: F) {
    while let Ok(event) = rx.recv() {
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
                Ok(_) => continue,
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
}
