use std::path::PathBuf;

use crate::core::remote::{get_repo_origin as core_get_repo_origin, RepoOrigin};
use crate::github::client::GithubClient;
use crate::github::{
    delete_github_token as core_delete_github_token, get_github_token as core_get_github_token,
    has_github_token, save_github_token as core_save_github_token, GitHostClient, LaunchpadItem,
};

pub fn slugify_issue_title(number: u64, title: &str) -> String {
    let slug: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    let mut parts: Vec<&str> = slug.split('-').filter(|s| !s.is_empty()).collect();
    // Limit to max 6 words for clean branch names
    if parts.len() > 6 {
        parts.truncate(6);
    }
    let slugified = parts.join("-");
    if slugified.is_empty() {
        format!("{number}-issue")
    } else {
        format!("{number}-{slugified}")
    }
}

#[tauri::command]
pub fn save_github_token(token: String) -> Result<(), String> {
    core_save_github_token(&token)
}

#[tauri::command]
pub fn get_github_token() -> Result<bool, String> {
    Ok(has_github_token())
}

#[tauri::command]
pub fn delete_github_token() -> Result<(), String> {
    core_delete_github_token()
}

#[tauri::command]
pub async fn test_github_token(token: Option<String>) -> Result<String, String> {
    let pat = match token {
        Some(t) if !t.trim().is_empty() => t.trim().to_string(),
        _ => core_get_github_token()?,
    };

    let client = GithubClient::new(pat)?;
    client.test_connection().await
}

#[tauri::command]
pub fn get_repo_origin(repo_path: String) -> Result<RepoOrigin, String> {
    let path = PathBuf::from(repo_path);
    core_get_repo_origin(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn github_search_prs(repo_path: String) -> Result<Vec<LaunchpadItem>, String> {
    let origin = get_repo_origin(repo_path)?;
    let pat = core_get_github_token()?;
    let client = GithubClient::new(pat)?;
    client.search_prs(&origin.owner, &origin.repo).await
}

#[tauri::command]
pub async fn github_get_launchpad_items(repo_path: String) -> Result<Vec<LaunchpadItem>, String> {
    let origin = get_repo_origin(repo_path)?;
    let pat = core_get_github_token()?;
    let client = GithubClient::new(pat)?;
    client
        .get_launchpad_items(&origin.owner, &origin.repo)
        .await
}

#[tauri::command]
pub async fn github_get_pr(repo_path: String, number: u64) -> Result<LaunchpadItem, String> {
    let origin = get_repo_origin(repo_path)?;
    let pat = core_get_github_token()?;
    let client = GithubClient::new(pat)?;
    client.get_pr(&origin.owner, &origin.repo, number).await
}

#[tauri::command]
pub async fn github_create_pr(
    repo_path: String,
    title: String,
    body: String,
    head: String,
    base: String,
) -> Result<LaunchpadItem, String> {
    let origin = get_repo_origin(repo_path)?;
    let pat = core_get_github_token()?;
    let client = GithubClient::new(pat)?;
    client
        .create_pr(&origin.owner, &origin.repo, &title, &body, &head, &base)
        .await
}

#[tauri::command]
pub fn start_work_on_issue(
    repo_path: String,
    number: u64,
    title: String,
) -> Result<String, String> {
    let path = PathBuf::from(&repo_path);
    let branch_name = slugify_issue_title(number, &title);

    // Create branch and checkout
    crate::core::branch::create_branch(&path, &branch_name, None).map_err(|e| e.to_string())?;
    crate::core::branch::checkout(&path, &branch_name).map_err(|e| e.to_string())?;

    Ok(branch_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_issue_titles_correctly() {
        assert_eq!(
            slugify_issue_title(123, "Fix login bug & session timeout!"),
            "123-fix-login-bug-session-timeout"
        );
        assert_eq!(
            slugify_issue_title(42, "Add dark mode toggle to UI layout components"),
            "42-add-dark-mode-toggle-to-ui"
        );
        assert_eq!(slugify_issue_title(99, "!!!"), "99-issue");
    }
}
