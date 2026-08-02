use std::path::Path;

use super::to_ipc_error;
use crate::core::submodule::{
    get_submodules as core_get_submodules, init_submodule as core_init_submodule,
    update_submodule as core_update_submodule, SubmoduleStatus,
};

#[tauri::command]
pub fn get_submodules(repo_path: String) -> Result<Vec<SubmoduleStatus>, String> {
    core_get_submodules(Path::new(&repo_path)).map_err(to_ipc_error)
}

#[tauri::command]
pub fn init_submodule(repo_path: String, submodule_path: String) -> Result<(), String> {
    core_init_submodule(Path::new(&repo_path), &submodule_path).map_err(to_ipc_error)
}

#[tauri::command]
pub fn update_submodule(repo_path: String, submodule_path: String) -> Result<(), String> {
    core_update_submodule(Path::new(&repo_path), &submodule_path).map_err(to_ipc_error)
}
