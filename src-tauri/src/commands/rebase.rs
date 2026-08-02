use tauri::State;

use crate::core::rebase::{self, RebaseTodoItem};
use crate::core::repo::{AppState, RepoId};

#[tauri::command]
pub fn plain_rebase(
    state: State<'_, AppState>,
    repo_id: RepoId,
    target: String,
) -> Result<String, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    rebase::plain_rebase(&repo.path, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn interactive_rebase(
    state: State<'_, AppState>,
    repo_id: RepoId,
    base_ref: String,
    todo_items: Vec<RebaseTodoItem>,
) -> Result<String, String> {
    let repo = state
        .get(&repo_id)
        .ok_or_else(|| format!("Unknown repository: {}", repo_id.as_str()))?;
    rebase::interactive_rebase(&repo.path, &base_ref, &todo_items).map_err(|e| e.to_string())
}
