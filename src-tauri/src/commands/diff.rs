use std::path::Path;

use super::to_ipc_error;
use crate::core::diff;
use crate::core::log::Commit;

#[tauri::command]
pub fn get_file_diff(repo_path: String, path: String, staged: bool) -> Result<String, String> {
    diff::diff_file(Path::new(&repo_path), &path, staged).map_err(to_ipc_error)
}

#[tauri::command]
pub fn get_untracked_diff(repo_path: String, path: String) -> Result<String, String> {
    diff::diff_untracked(Path::new(&repo_path), &path).map_err(to_ipc_error)
}

#[tauri::command]
pub fn get_commit_diff(repo_path: String, hash: String) -> Result<String, String> {
    diff::diff_commit(Path::new(&repo_path), &hash).map_err(to_ipc_error)
}

#[tauri::command]
pub fn get_file_history(
    repo_path: String,
    path: String,
    limit: usize,
) -> Result<Vec<Commit>, String> {
    diff::file_history(Path::new(&repo_path), &path, limit).map_err(to_ipc_error)
}

#[tauri::command]
pub fn get_blame(repo_path: String, path: String) -> Result<Vec<diff::BlameLine>, String> {
    diff::blame(Path::new(&repo_path), &path).map_err(to_ipc_error)
}
