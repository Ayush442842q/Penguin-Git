pub mod config;
pub mod provider;

use std::path::Path;

use serde::{Deserialize, Serialize};

pub use config::{
    get_ai_config, save_ai_config, test_ai_connection, AiConfig, AiConfigResponse,
};
pub use provider::{AiError, AiProvider, AnthropicProvider, OpenAiProvider};

use super::diff::{diff_commit, diff_repo};
use super::exec::run_git;

const MAX_DIFF_BYTES: usize = 8000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExplainBranchResult {
    pub explanation: String,
    pub branch_tip_sha: String,
    pub target_tip_sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDescriptionResult {
    pub title: String,
    pub body: String,
}

fn truncate_diff_if_needed(diff: &str) -> String {
    if diff.len() <= MAX_DIFF_BYTES {
        diff.to_string()
    } else {
        let truncated = &diff[..MAX_DIFF_BYTES];
        format!("{truncated}\n\n[Diff truncated due to size limits. Total length was {} bytes]", diff.len())
    }
}

pub async fn get_active_provider() -> Result<Box<dyn AiProvider>, AiError> {
    let config = config::load_saved_config();
    let key = config::get_api_key()?;

    match config.provider.as_str() {
        "anthropic" => Ok(Box::new(AnthropicProvider::new(config.model, key))),
        "openai" => Ok(Box::new(OpenAiProvider::new(config.model, key))),
        other => Err(AiError::InvalidConfig(format!(
            "Unsupported provider '{other}'"
        ))),
    }
}

pub async fn ai_compose_commit_message(repo_path: &Path) -> Result<String, AiError> {
    let staged_diff = diff_repo(repo_path, true)
        .map_err(|e| AiError::ProviderError(format!("Failed to read staged diff: {e}")))?;

    if staged_diff.trim().is_empty() {
        return Err(AiError::ProviderError(
            "No staged changes found to compose commit message.".to_string(),
        ));
    }

    let diff_input = truncate_diff_if_needed(&staged_diff);
    let provider = get_active_provider().await?;

    let system_prompt = "You are an expert Git commit author. Given the staged git diff, generate a concise, high-quality commit message following conventional commits format (e.g. feat: ..., fix: ...). Output ONLY the commit message subject (and body if helpful). Do not wrap in code blocks, quotes, or conversational preamble.";
    let user_prompt = format!("Staged diff:\n{diff_input}");

    let response = provider.complete(system_prompt, &user_prompt).await?;
    Ok(response.trim().to_string())
}

pub async fn ai_explain_commit(repo_path: &Path, hash: &str) -> Result<String, AiError> {
    let raw_diff = diff_commit(repo_path, hash)
        .map_err(|e| AiError::ProviderError(format!("Failed to read commit diff: {e}")))?;

    let diff_input = truncate_diff_if_needed(&raw_diff);
    let provider = get_active_provider().await?;

    let system_prompt = "You are an expert code reviewer. Explain what this commit changed, the technical purpose of the changes, and any notable impact in clean markdown bullet points.";
    let user_prompt = format!("Commit {hash} diff:\n{diff_input}");

    let response = provider.complete(system_prompt, &user_prompt).await?;
    Ok(response.trim().to_string())
}

pub fn get_branch_diff(repo_path: &Path, branch: &str, target: &str) -> Result<String, AiError> {
    let range = format!("{target}...{branch}");
    run_git(repo_path, &["diff", "--no-color", &range])
        .map_err(|e| AiError::ProviderError(format!("Failed to get branch diff ({range}): {e}")))
}

fn resolve_ref_sha(repo_path: &Path, r: &str) -> Result<String, AiError> {
    run_git(repo_path, &["rev-parse", r])
        .map(|s| s.trim().to_string())
        .map_err(|e| AiError::ProviderError(format!("Failed to resolve SHA for ref '{r}': {e}")))
}

pub async fn ai_explain_branch(
    repo_path: &Path,
    branch: &str,
    target: &str,
) -> Result<AiExplainBranchResult, AiError> {
    let raw_diff = get_branch_diff(repo_path, branch, target)?;
    let branch_tip_sha = resolve_ref_sha(repo_path, branch)?;
    let target_tip_sha = resolve_ref_sha(repo_path, target)?;

    let diff_input = truncate_diff_if_needed(&raw_diff);
    let provider = get_active_provider().await?;

    let system_prompt = format!("You are a lead software architect. Explain the changes in branch '{branch}' relative to base branch '{target}'. Provide a concise summary followed by key component updates.");
    let user_prompt = format!("Branch diff ({target}...{branch}):\n{diff_input}");

    let explanation = provider.complete(&system_prompt, &user_prompt).await?;

    Ok(AiExplainBranchResult {
        explanation: explanation.trim().to_string(),
        branch_tip_sha,
        target_tip_sha,
    })
}

pub async fn ai_generate_pr_description(
    repo_path: &Path,
    branch: &str,
    target: &str,
) -> Result<PrDescriptionResult, AiError> {
    let raw_diff = get_branch_diff(repo_path, branch, target)?;
    let diff_input = truncate_diff_if_needed(&raw_diff);
    let provider = get_active_provider().await?;

    let system_prompt = "You are a lead software engineer preparing a Pull Request description. Format your response strictly as JSON with two string keys: 'title' (a clear PR title) and 'body' (a structured markdown description with ## Summary, ## Key Changes, and ## Verification). Do not add markdown backticks around the JSON output.";
    let user_prompt = format!("Branch diff ({target}...{branch}):\n{diff_input}");

    let response_text = provider.complete(system_prompt, &user_prompt).await?;
    let cleaned = response_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(parsed) = serde_json::from_str::<PrDescriptionResult>(cleaned) {
        Ok(parsed)
    } else {
        Ok(PrDescriptionResult {
            title: format!("PR: {branch} into {target}"),
            body: response_text.trim().to_string(),
        })
    }
}
