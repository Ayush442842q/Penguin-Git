use tauri::State;

use crate::core::conflict::{
    self, abort_operation as core_abort, continue_operation as core_continue, Conflict3Way,
};
use crate::core::merge_state::{detect_operation_state, RepoOperationState};
use crate::core::repo::{AppState, RepoId};

#[tauri::command]
pub fn get_repo_operation_state(
    state: State<'_, AppState>,
    repo_id: RepoId,
) -> Result<RepoOperationState, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    Ok(detect_operation_state(&repo.path))
}

#[tauri::command]
pub fn read_conflict_stages(
    state: State<'_, AppState>,
    repo_id: RepoId,
    path: String,
) -> Result<Conflict3Way, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    conflict::read_conflict_stages(&repo.path, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_conflict(
    state: State<'_, AppState>,
    repo_id: RepoId,
    path: String,
    content: String,
) -> Result<(), String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    conflict::resolve_conflict(&repo.path, &path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn continue_operation(
    state: State<'_, AppState>,
    repo_id: RepoId,
) -> Result<String, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    let op_state = detect_operation_state(&repo.path);
    let op_kind = op_state
        .kind
        .ok_or_else(|| "No operation currently in progress".to_string())?;

    core_continue(&repo.path, op_kind).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn abort_operation(
    state: State<'_, AppState>,
    repo_id: RepoId,
) -> Result<String, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    let op_state = detect_operation_state(&repo.path);
    let op_kind = op_state
        .kind
        .ok_or_else(|| "No operation currently in progress".to_string())?;

    core_abort(&repo.path, op_kind).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn skip_rebase(
    state: State<'_, AppState>,
    repo_id: RepoId,
) -> Result<String, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    conflict::skip_rebase(&repo.path).map_err(|e| e.to_string())
}
