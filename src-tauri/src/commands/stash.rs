use std::path::Path;

use super::to_ipc_error;
use crate::core::stash::{self, Stash};

#[tauri::command]
pub fn get_stashes(repo_path: String) -> Result<Vec<Stash>, String> {
    stash::list_stashes(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn save_stash(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), String> {
    stash::save_stash(Path::new(&repo_path), message.as_deref(), include_untracked)
        .map_err(to_ipc_error)
}

#[tauri::command]
pub fn get_stash_diff(repo_path: String, index: usize) -> Result<String, String> {
    stash::stash_diff(Path::new(&repo_path), index).map_err(to_ipc_error)
}

/// Restores the stash and keeps it. Distinct from [`pop_stash`] — see `core::stash`.
#[tauri::command]
pub fn apply_stash(repo_path: String, index: usize, hash: String) -> Result<(), String> {
    stash::apply_stash(Path::new(&repo_path), index, &hash).map_err(to_ipc_error)
}

/// Restores the stash and removes it. Distinct from [`apply_stash`].
#[tauri::command]
pub fn pop_stash(repo_path: String, index: usize, hash: String) -> Result<(), String> {
    stash::pop_stash(Path::new(&repo_path), index, &hash).map_err(to_ipc_error)
}

#[tauri::command]
pub fn drop_stash(repo_path: String, index: usize, hash: String) -> Result<(), String> {
    stash::drop_stash(Path::new(&repo_path), index, &hash).map_err(to_ipc_error)
}
