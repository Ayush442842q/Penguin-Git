use std::path::Path;

use super::to_ipc_error;
use crate::core::remote::{self, Remote};

#[tauri::command]
pub fn get_remotes(repo_path: String) -> Result<Vec<Remote>, String> {
    remote::list_remotes(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn add_remote(repo_path: String, name: String, url: String) -> Result<(), String> {
    remote::add_remote(Path::new(&repo_path), &name, &url).map_err(to_ipc_error)
}

#[tauri::command]
pub fn remove_remote(repo_path: String, name: String) -> Result<(), String> {
    remote::remove_remote(Path::new(&repo_path), &name).map_err(to_ipc_error)
}

#[tauri::command]
pub fn set_remote_url(repo_path: String, name: String, url: String) -> Result<(), String> {
    remote::set_remote_url(Path::new(&repo_path), &name, &url).map_err(to_ipc_error)
}

#[tauri::command]
pub fn fetch(repo_path: String, remote_name: Option<String>) -> Result<(), String> {
    remote::fetch(Path::new(&repo_path), remote_name.as_deref()).map_err(to_ipc_error)
}

#[tauri::command]
pub fn pull(repo_path: String) -> Result<(), String> {
    remote::pull(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn push(
    repo_path: String,
    remote_name: Option<String>,
    branch_name: Option<String>,
    set_upstream: bool,
) -> Result<(), String> {
    remote::push(
        Path::new(&repo_path),
        remote_name.as_deref(),
        branch_name.as_deref(),
        set_upstream,
    )
    .map_err(to_ipc_error)
}
