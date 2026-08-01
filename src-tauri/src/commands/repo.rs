use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use super::to_ipc_error;
use crate::core::repo::{open_repo as core_open_repo, AppState, RepoId, RepoState};
use crate::core::watcher::{RepoChanged, RepoWatcher, REPO_CHANGED_EVENT};

/// Opens a repository, caches its state, and starts watching it for changes.
#[tauri::command]
pub fn open_repo(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
    watchers: State<'_, WatcherRegistry>,
) -> Result<RepoState, String> {
    let repo = core_open_repo(Path::new(&path)).map_err(to_ipc_error)?;
    state.insert(repo.clone());
    watchers.watch(&repo, app);
    Ok(repo)
}

#[tauri::command]
pub fn list_open_repos(state: State<'_, AppState>) -> Vec<RepoState> {
    state.list()
}

#[tauri::command]
pub fn close_repo(
    repo_id: String,
    state: State<'_, AppState>,
    watchers: State<'_, WatcherRegistry>,
) {
    let id = RepoId(repo_id);
    watchers.unwatch(&id);
    state.remove(&id);
}

/// Keeps one [`RepoWatcher`] alive per open repository.
///
/// Watchers stop when dropped, so they have to be owned somewhere for as long
/// as the repo is open; this registry is that owner.
#[derive(Default)]
pub struct WatcherRegistry {
    watchers: std::sync::Mutex<std::collections::HashMap<RepoId, RepoWatcher>>,
}

impl WatcherRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts watching `repo`, emitting [`REPO_CHANGED_EVENT`] to the frontend
    /// on every debounced change. Re-opening an already-watched repo replaces
    /// the existing watcher rather than stacking a second one.
    fn watch(&self, repo: &RepoState, app: AppHandle) {
        let id = repo.id.clone();
        let payload = RepoChanged {
            repo_id: id.0.clone(),
        };

        let Ok(watcher) = RepoWatcher::start(&repo.path, move || {
            // A failed emit means the window is gone; nothing to recover.
            let _ = app.emit(REPO_CHANGED_EVENT, payload.clone());
        }) else {
            // Watching is an optimization over manual refresh — if the platform
            // refuses (inotify limits, an unusual filesystem), the app still
            // works, so this must not fail opening the repo.
            return;
        };

        let mut watchers = self.watchers.lock().expect("watcher registry poisoned");
        watchers.insert(id, watcher);
    }

    fn unwatch(&self, id: &RepoId) {
        let mut watchers = self.watchers.lock().expect("watcher registry poisoned");
        watchers.remove(id);
    }
}

/// Resolves a repo id back to its working tree path.
///
/// Every other command takes a `repo_path` string directly from the frontend
/// store, so this exists for the id-keyed callers (and Phase 3's repo tabs).
#[tauri::command]
pub fn repo_path_for(repo_id: String, state: State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .get(&RepoId(repo_id))
        .map(|repo| repo.path)
        .ok_or_else(|| "repository is not open".to_string())
}
