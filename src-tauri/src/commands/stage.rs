use std::path::Path;

use super::to_ipc_error;
use crate::core::stage;

#[tauri::command]
pub fn stage_file(repo_path: String, path: String) -> Result<(), String> {
    stage::stage_file(Path::new(&repo_path), &path).map_err(to_ipc_error)
}

#[tauri::command]
pub fn stage_all(repo_path: String) -> Result<(), String> {
    stage::stage_all(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn unstage_file(repo_path: String, path: String) -> Result<(), String> {
    stage::unstage_file(Path::new(&repo_path), &path).map_err(to_ipc_error)
}

#[tauri::command]
pub fn unstage_all(repo_path: String) -> Result<(), String> {
    stage::unstage_all(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn discard_file_changes(repo_path: String, path: String) -> Result<(), String> {
    stage::discard_file_changes(Path::new(&repo_path), &path).map_err(to_ipc_error)
}

#[tauri::command]
pub fn discard_untracked(repo_path: String, path: String) -> Result<(), String> {
    stage::discard_untracked(Path::new(&repo_path), &path).map_err(to_ipc_error)
}
