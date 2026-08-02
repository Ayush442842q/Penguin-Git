use std::path::Path;

use crate::core::ai::{self, AiConfigResponse, AiExplainBranchResult, PrDescriptionResult};
use crate::core::stage_hunk;

#[tauri::command]
pub fn save_ai_config(
    provider: String,
    model: String,
    api_key: Option<String>,
) -> Result<AiConfigResponse, String> {
    ai::save_ai_config(provider, model, api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_config() -> Result<AiConfigResponse, String> {
    ai::get_ai_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_ai_connection(
    provider: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
) -> Result<bool, String> {
    ai::test_ai_connection(provider, model, api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_compose_commit_message(repo_path: String) -> Result<String, String> {
    ai::ai_compose_commit_message(Path::new(&repo_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_explain_commit(repo_path: String, hash: String) -> Result<String, String> {
    ai::ai_explain_commit(Path::new(&repo_path), &hash)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_explain_branch(
    repo_path: String,
    branch: String,
    target: String,
) -> Result<AiExplainBranchResult, String> {
    ai::ai_explain_branch(Path::new(&repo_path), &branch, &target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_generate_pr_description(
    repo_path: String,
    branch: String,
    target: String,
) -> Result<PrDescriptionResult, String> {
    ai::ai_generate_pr_description(Path::new(&repo_path), &branch, &target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_branch_diff(
    repo_path: String,
    branch: String,
    target: String,
) -> Result<String, String> {
    ai::get_branch_diff(Path::new(&repo_path), &branch, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_stage_hunk(repo_path: String, patch: String) -> Result<(), String> {
    stage_hunk::git_stage_hunk(Path::new(&repo_path), &patch).map_err(|e| e.to_string())
}
