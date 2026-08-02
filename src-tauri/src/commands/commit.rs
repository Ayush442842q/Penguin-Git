use std::path::Path;
use tauri::State;

use super::to_ipc_error;
use crate::core::commit::{self, ResetMode};
use crate::core::exec::run_git;
use crate::core::repo::AppState;
use crate::core::undo::ActionType;

#[tauri::command]
pub fn commit_changes(
    state: State<'_, AppState>,
    repo_path: String,
    subject: String,
    body: Option<String>,
    amend: bool,
) -> Result<String, String> {
    let p = Path::new(&repo_path);
    let previous_head = run_git(p, &["rev-parse", "HEAD"])
        .unwrap_or_default()
        .trim()
        .to_string();

    state.journal.record(
        ActionType::Commit { previous_head },
        format!("Commit: {subject}"),
    );

    commit::commit(p, &subject, body.as_deref(), amend).map_err(to_ipc_error)
}

#[tauri::command]
pub fn get_commit_message(repo_path: String, hash: String) -> Result<String, String> {
    commit::commit_message(Path::new(&repo_path), &hash).map_err(to_ipc_error)
}

#[tauri::command]
pub fn cherry_pick(repo_path: String, hash: String) -> Result<(), String> {
    commit::cherry_pick(Path::new(&repo_path), &hash).map_err(to_ipc_error)
}

#[tauri::command]
pub fn revert_commit(repo_path: String, hash: String) -> Result<(), String> {
    commit::revert(Path::new(&repo_path), &hash).map_err(to_ipc_error)
}

#[tauri::command]
pub fn reset_to_commit(repo_path: String, hash: String, mode: String) -> Result<(), String> {
    let mode = ResetMode::parse(&mode).ok_or_else(|| format!("unknown reset mode: {mode}"))?;
    commit::reset(Path::new(&repo_path), &hash, mode).map_err(to_ipc_error)
}

#[tauri::command]
pub fn create_tag(
    repo_path: String,
    name: String,
    hash: String,
    message: Option<String>,
) -> Result<(), String> {
    commit::create_tag(Path::new(&repo_path), &name, &hash, message.as_deref())
        .map_err(to_ipc_error)
}

#[tauri::command]
pub fn delete_tag(repo_path: String, name: String) -> Result<(), String> {
    commit::delete_tag(Path::new(&repo_path), &name).map_err(to_ipc_error)
}
