use tauri::State;

use crate::core::repo::AppState;
use crate::core::repo_registry::RegisteredRepo;
use crate::core::workspace::LocalWorkspace;

#[tauri::command]
pub fn create_workspace(
    name: String,
    state: State<'_, AppState>,
) -> Result<LocalWorkspace, String> {
    state.registry.create_workspace(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_workspace(
    id: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .registry
        .rename_workspace(&id, &new_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workspace(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.registry.delete_workspace(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<LocalWorkspace>, String> {
    state.registry.list_workspaces().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_repo_to_workspace(
    workspace_id: String,
    repo_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .registry
        .add_repo_to_workspace(&workspace_id, &repo_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_repo_from_workspace(
    workspace_id: String,
    repo_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .registry
        .remove_repo_from_workspace(&workspace_id, &repo_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workspace_repos(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<RegisteredRepo>, String> {
    state
        .registry
        .list_workspace_repos(&workspace_id)
        .map_err(|e| e.to_string())
}
