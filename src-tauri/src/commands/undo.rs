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
        .journal
        .undo_latest(&repo.path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_undo_history(state: State<'_, AppState>) -> Result<Vec<ActionSnapshot>, String> {
    Ok(state.journal.get_history())
}
