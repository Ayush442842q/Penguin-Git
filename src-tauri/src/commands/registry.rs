use tauri::State;

use crate::core::repo::AppState;
use crate::core::repo_registry::RegisteredRepo;

#[tauri::command]
pub fn list_recent_repos(state: State<'_, AppState>) -> Result<Vec<RegisteredRepo>, String> {
    state.registry.list_recent(20).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn forget_recent_repo(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.registry.remove_repo(&id).map_err(|e| e.to_string())
}
