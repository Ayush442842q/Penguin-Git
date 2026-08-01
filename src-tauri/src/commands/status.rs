use std::path::Path;

use super::to_ipc_error;
use crate::core::status::{get_status as core_get_status, RepoStatus};

#[tauri::command]
pub fn get_git_status(repo_path: String) -> Result<RepoStatus, String> {
    core_get_status(Path::new(&repo_path)).map_err(to_ipc_error)
}
