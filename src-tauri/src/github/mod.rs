pub mod client;

use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "penguingit";
const KEYRING_USER: &str = "github_pat";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchpadItem {
    pub kind: String,        // "pr" or "issue"
    pub title: String,
    pub number: u64,
    pub repo: String,         // "owner/repo"
    pub url: String,          // html_url
    pub category: String,     // "Needs review", "Your PRs", "Ready to merge", "Issues"
    pub updated_at: String,
    pub author: String,
    pub state: String,
}

pub trait GitHostClient: Send + Sync {
    fn search_prs(
        &self,
        owner: &str,
        repo: &str,
    ) -> impl std::future::Future<Output = Result<Vec<LaunchpadItem>, String>> + Send;
    fn get_pr(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> impl std::future::Future<Output = Result<LaunchpadItem, String>> + Send;
    fn create_pr(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: &str,
        head: &str,
        base: &str,
    ) -> impl std::future::Future<Output = Result<LaunchpadItem, String>> + Send;
    fn get_issues(
        &self,
        owner: &str,
        repo: &str,
    ) -> impl std::future::Future<Output = Result<Vec<LaunchpadItem>, String>> + Send;
    fn get_launchpad_items(
        &self,
        owner: &str,
        repo: &str,
    ) -> impl std::future::Future<Output = Result<Vec<LaunchpadItem>, String>> + Send;
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring initialization failed: {e}"))
}

pub fn save_github_token(token: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry
        .set_password(token.trim())
        .map_err(|e| format!("Failed to save GitHub token to keychain: {e}"))?;
    Ok(())
}

pub fn get_github_token() -> Result<String, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(key) if !key.trim().is_empty() => Ok(key),
        _ => Err("GitHub PAT not set in keychain".to_string()),
    }
}

pub fn delete_github_token() -> Result<(), String> {
    let entry = keyring_entry()?;
    let _ = entry.delete_credential();
    Ok(())
}

pub fn has_github_token() -> bool {
    get_github_token().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launchpad_item_serialization() {
        let item = LaunchpadItem {
            kind: "pr".to_string(),
            title: "Fix bug".to_string(),
            number: 42,
            repo: "owner/repo".to_string(),
            url: "https://github.com/owner/repo/pull/42".to_string(),
            category: "Needs review".to_string(),
            updated_at: "2026-08-02T12:00:00Z".to_string(),
            author: "dev".to_string(),
            state: "open".to_string(),
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"updatedAt\":"));
        assert!(json.contains("\"kind\":\"pr\""));
    }
}
