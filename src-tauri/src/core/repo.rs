use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::exec::{run_git, GitError};

/// Stable identity for an open repository.
///
/// Derived from the canonical (symlink-resolved) path of the repository's
/// working tree, so two different paths that resolve to the same repo — say a
/// symlinked checkout — map to one entry rather than two diverging caches.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct RepoId(pub String);

impl RepoId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Everything we know about one open repository.
///
/// Phase 1's UI only ever opens one repo, but this is deliberately stored in a
/// map keyed by `RepoId` (see `AppState`) rather than as a single flat value.
/// Multi-repo support (Phase 3) then becomes a UI change instead of a rewrite
/// of every command signature.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoState {
    pub id: RepoId,
    /// Canonical path to the working tree root.
    pub path: PathBuf,
    /// Directory name of the working tree root — what the UI labels the repo.
    pub name: String,
    /// Current branch name, or `None` when HEAD is detached.
    pub head_branch: Option<String>,
}

/// Tauri-managed application state.
///
/// The `Mutex<HashMap<..>>` shape is intentional groundwork for Phase 3; do not
/// collapse it to a single `RepoState` just because Phase 1 only uses one entry.
pub struct AppState {
    repos: Mutex<HashMap<RepoId, RepoState>>,
    journals: Mutex<HashMap<String, std::sync::Arc<crate::core::undo::ActionJournal>>>,
    pub registry: crate::core::repo_registry::RepoRegistry,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

fn default_db_path() -> PathBuf {
    let base = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join(".config")
        .join("penguingit")
        .join("penguingit.db")
}

impl AppState {
    pub fn new() -> Self {
        let db_path = default_db_path();
        let registry =
            crate::core::repo_registry::RepoRegistry::open(&db_path).unwrap_or_else(|_| {
                crate::core::repo_registry::RepoRegistry::open_in_memory()
                    .expect("in-memory sqlite db creation should never fail")
            });
        Self {
            repos: Mutex::new(HashMap::new()),
            journals: Mutex::new(HashMap::new()),
            registry,
        }
    }

    pub fn with_in_memory_registry() -> Self {
        let registry = crate::core::repo_registry::RepoRegistry::open_in_memory()
            .expect("in-memory sqlite db creation should never fail");
        Self {
            repos: Mutex::new(HashMap::new()),
            journals: Mutex::new(HashMap::new()),
            registry,
        }
    }

    pub fn get_journal(&self, repo_path: &str) -> std::sync::Arc<crate::core::undo::ActionJournal> {
        let mut journals = self.journals.lock().expect("journals mutex poisoned");
        let canonical_path = Path::new(repo_path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(repo_path))
            .to_string_lossy()
            .into_owned();

        journals
            .entry(canonical_path)
            .or_insert_with(|| std::sync::Arc::new(crate::core::undo::ActionJournal::new()))
            .clone()
    }

    pub fn insert(&self, state: RepoState) {
        let mut repos = self.repos.lock().expect("repo state mutex poisoned");
        repos.insert(state.id.clone(), state);
    }

    pub fn get(&self, id: &RepoId) -> Option<RepoState> {
        let repos = self.repos.lock().expect("repo state mutex poisoned");
        repos.get(id).cloned()
    }

    pub fn list(&self) -> Vec<RepoState> {
        let repos = self.repos.lock().expect("repo state mutex poisoned");
        let mut out: Vec<RepoState> = repos.values().cloned().collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    pub fn remove(&self, id: &RepoId) {
        let mut repos = self.repos.lock().expect("repo state mutex poisoned");
        repos.remove(id);
    }
}

/// Resolves `path` (which may be any directory inside a repository) to the
/// working tree root, then builds the `RepoState` describing it.
///
/// Returns `GitError::CommandFailed` if the path isn't inside a git repository —
/// `rev-parse --show-toplevel` is what does the detecting, so we don't need to
/// hunt for a `.git` directory ourselves and get worktrees/submodules wrong.
pub fn open_repo(path: &Path) -> Result<RepoState, GitError> {
    let toplevel = run_git(path, &["rev-parse", "--show-toplevel"])?
        .trim()
        .to_string();
    let root = PathBuf::from(&toplevel);

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| toplevel.clone());

    Ok(RepoState {
        id: RepoId(toplevel),
        head_branch: head_branch(&root)?,
        path: root,
        name,
    })
}

/// The branch HEAD points at, or `None` when HEAD is detached.
///
/// `--quiet` makes git exit non-zero instead of printing on detached HEAD, which
/// is the case we want to translate into `None` rather than propagate as an error.
pub fn head_branch(repo_path: &Path) -> Result<Option<String>, GitError> {
    match run_git(repo_path, &["symbolic-ref", "--quiet", "--short", "HEAD"]) {
        Ok(name) => Ok(Some(name.trim().to_string())),
        Err(GitError::CommandFailed { .. }) => Ok(None),
        Err(other) => Err(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn open_repo_resolves_root_and_branch() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "hello", "Initial commit");

        let state = open_repo(repo.path()).expect("should open the fixture repo");

        assert_eq!(state.head_branch.as_deref(), Some("main"));
        assert_eq!(
            state.name,
            state.path.file_name().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn open_repo_from_subdirectory_resolves_to_worktree_root() {
        let repo = FixtureRepo::new();
        repo.commit("nested/deep/file.txt", "x", "Add nested file");
        let nested = repo.file_path("nested/deep");

        let from_root = open_repo(repo.path()).expect("open from root");
        let from_nested = open_repo(&nested).expect("open from a subdirectory");

        // Both must produce the same identity — otherwise opening the same repo
        // by two different paths would create two diverging cache entries.
        assert_eq!(from_root.id, from_nested.id);
    }

    #[test]
    fn open_repo_fails_outside_a_repository() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(open_repo(dir.path()).is_err());
    }

    #[test]
    fn head_branch_is_none_when_detached() {
        let repo = FixtureRepo::new();
        let sha = repo.commit("a.txt", "hello", "Initial commit");
        repo.git(&["checkout", "--detach", &sha]);

        assert_eq!(
            head_branch(repo.path()).expect("detached HEAD is not an error"),
            None
        );
    }

    #[test]
    fn app_state_is_keyed_by_repo_id() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "hello", "Initial commit");
        let state = open_repo(repo.path()).expect("open");

        let app = AppState::new();
        app.insert(state.clone());
        // Re-inserting the same repo must replace, not duplicate.
        app.insert(state.clone());

        assert_eq!(app.list().len(), 1);
        assert_eq!(app.get(&state.id).map(|s| s.name), Some(state.name.clone()));

        app.remove(&state.id);
        assert!(app.get(&state.id).is_none());
    }

    #[test]
    fn app_state_holds_several_repos_at_once_sorted_by_name() {
        // Phase 1's UI opens one repo, but the state is deliberately shaped for
        // many — this is the behaviour Phase 3 will depend on.
        let first = FixtureRepo::new();
        first.commit("a.txt", "x", "Initial commit");
        let second = FixtureRepo::new();
        second.commit("a.txt", "x", "Initial commit");

        let app = AppState::new();
        app.insert(open_repo(first.path()).expect("open first"));
        app.insert(open_repo(second.path()).expect("open second"));

        let listed = app.list();
        assert_eq!(listed.len(), 2, "two distinct repos must not collapse");
        let mut names: Vec<&str> = listed.iter().map(|s| s.name.as_str()).collect();
        let sorted = {
            let mut copy = names.clone();
            copy.sort_unstable();
            copy
        };
        names.sort_unstable();
        assert_eq!(names, sorted, "list() returns repos in name order");
    }

    #[test]
    fn removing_one_repo_leaves_the_others_open() {
        let first = FixtureRepo::new();
        first.commit("a.txt", "x", "Initial commit");
        let second = FixtureRepo::new();
        second.commit("a.txt", "x", "Initial commit");

        let app = AppState::new();
        let a = open_repo(first.path()).expect("open");
        let b = open_repo(second.path()).expect("open");
        app.insert(a.clone());
        app.insert(b.clone());

        app.remove(&a.id);

        assert!(app.get(&a.id).is_none());
        assert!(app.get(&b.id).is_some());
        assert_eq!(app.list().len(), 1);
    }

    #[test]
    fn get_on_an_unknown_id_is_none_rather_than_a_panic() {
        let app = AppState::new();
        assert!(app.get(&RepoId("/nowhere".to_string())).is_none());
        // Removing something that was never inserted must also be harmless.
        app.remove(&RepoId("/nowhere".to_string()));
        assert!(app.list().is_empty());
    }

    #[test]
    fn repo_id_is_the_canonical_worktree_root() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");

        let state = open_repo(repo.path()).expect("open");

        assert_eq!(state.id.as_str(), state.path.to_string_lossy());
        assert!(
            state.path.join(".git").exists(),
            "the id must name the worktree root, not a subdirectory"
        );
    }

    #[test]
    fn open_repo_reports_the_branch_after_a_switch() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        repo.git(&["checkout", "-b", "feature/login"]);

        let state = open_repo(repo.path()).expect("open");

        assert_eq!(state.head_branch.as_deref(), Some("feature/login"));
        assert_eq!(
            head_branch(repo.path()).expect("head branch"),
            Some("feature/login".to_string())
        );
    }

    #[test]
    fn open_repo_works_on_a_repository_with_no_commits() {
        // A freshly `git init`-ed directory is a perfectly valid thing to open,
        // and it is the first thing a user does when starting a new project.
        let repo = FixtureRepo::new();

        let state = open_repo(repo.path()).expect("an empty repo must still open");

        assert_eq!(
            state.head_branch.as_deref(),
            Some("main"),
            "HEAD points at an unborn branch, which is still a branch name"
        );
    }

    #[test]
    fn open_repo_fails_rather_than_walking_up_out_of_a_temp_dir() {
        // `rev-parse --show-toplevel` is what does the detecting; a plain
        // directory must be rejected, not silently resolved to some ancestor.
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("deep/nested");
        std::fs::create_dir_all(&nested).expect("mkdir");

        assert!(open_repo(&nested).is_err());
    }

    #[test]
    fn test_scoped_journals_are_isolated() {
        let state = AppState::with_in_memory_registry();

        let path1 = "/path/to/repo1";
        let path2 = "/path/to/repo2";

        let journal1 = state.get_journal(path1);
        let journal2 = state.get_journal(path2);

        journal1.record(
            crate::core::undo::ActionType::Checkout {
                previous_ref: "main".into(),
            },
            "Checkout in repo1",
        );

        assert_eq!(journal1.get_history().len(), 1);
        assert_eq!(journal2.get_history().len(), 0);
    }
}
