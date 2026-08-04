use std::path::Path;

use super::to_ipc_error;
use crate::core::patch::{self, PatchExport, PatchPreview};

#[tauri::command]
pub fn export_patch(
    repo_path: String,
    commit_range: Option<String>,
) -> Result<PatchExport, String> {
    patch::export_patch(Path::new(&repo_path), commit_range.as_deref()).map_err(to_ipc_error)
}

#[tauri::command]
pub fn preview_patch(repo_path: String, patch_content: String) -> Result<PatchPreview, String> {
    patch::preview_patch(Path::new(&repo_path), &patch_content).map_err(to_ipc_error)
}

#[tauri::command]
pub fn apply_patch(repo_path: String, patch_content: String) -> Result<String, String> {
    patch::apply_patch(Path::new(&repo_path), &patch_content).map_err(to_ipc_error)
}

#[tauri::command]
pub fn write_patch_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write patch file: {e}"))
}
