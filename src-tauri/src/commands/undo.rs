use tauri::State;

use crate::core::repo::{AppState, RepoId};
use crate::core::undo::ActionSnapshot;

#[tauri::command]
pub fn undo_last_action(
    state: State<'_, AppState>,
    repo_id: RepoId,
) -> Result<ActionSnapshot, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    state
        .get_journal(&repo.path.to_string_lossy())
        .undo_latest(&repo.path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn redo_last_action(
    state: State<'_, AppState>,
    repo_id: RepoId,
) -> Result<ActionSnapshot, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    state
        .get_journal(&repo.path.to_string_lossy())
        .redo_latest(&repo.path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_undo_history(
    state: State<'_, AppState>,
    repo_id: Option<RepoId>,
) -> Result<Vec<ActionSnapshot>, String> {
    if let Some(id) = repo_id {
        let repo = state
            .get(&id)
            .ok_or_else(|| format!("Unknown repository: {}", id.as_str()))?;
        Ok(state
            .get_journal(&repo.path.to_string_lossy())
            .get_history())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn get_redo_history(
    state: State<'_, AppState>,
    repo_id: Option<RepoId>,
) -> Result<Vec<ActionSnapshot>, String> {
    if let Some(id) = repo_id {
        let repo = state
            .get(&id)
            .ok_or_else(|| format!("Unknown repository: {}", id.as_str()))?;
        Ok(state
            .get_journal(&repo.path.to_string_lossy())
            .get_redo_history())
    } else {
        Ok(Vec::new())
    }
}
