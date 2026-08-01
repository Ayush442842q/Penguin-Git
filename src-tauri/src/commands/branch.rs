use std::path::Path;

use super::to_ipc_error;
use crate::core::branch::{self, Branch};

#[tauri::command]
pub fn get_branches(repo_path: String) -> Result<Vec<Branch>, String> {
    branch::list_branches(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn create_branch(
    repo_path: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    branch::create_branch(Path::new(&repo_path), &name, start_point.as_deref())
        .map_err(to_ipc_error)
}

#[tauri::command]
pub fn delete_branch(repo_path: String, name: String, force: bool) -> Result<(), String> {
    branch::delete_branch(Path::new(&repo_path), &name, force).map_err(to_ipc_error)
}

#[tauri::command]
pub fn rename_branch(repo_path: String, old: String, new: String) -> Result<(), String> {
    branch::rename_branch(Path::new(&repo_path), &old, &new).map_err(to_ipc_error)
}

#[tauri::command]
pub fn checkout(repo_path: String, target: String) -> Result<(), String> {
    branch::checkout(Path::new(&repo_path), &target).map_err(to_ipc_error)
}

#[tauri::command]
pub fn checkout_new_branch(
    repo_path: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    branch::checkout_new(Path::new(&repo_path), &name, start_point.as_deref()).map_err(to_ipc_error)
}

#[tauri::command]
pub fn merge_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    branch::merge_branch(Path::new(&repo_path), &branch_name).map_err(to_ipc_error)
}

#[tauri::command]
pub fn rebase_onto(repo_path: String, onto: String) -> Result<(), String> {
    branch::rebase_onto(Path::new(&repo_path), &onto).map_err(to_ipc_error)
}
