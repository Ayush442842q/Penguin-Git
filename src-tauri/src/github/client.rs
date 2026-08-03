use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

use super::{GitHostClient, LaunchpadItem};

#[derive(Debug, Clone)]
pub struct GithubClient {
    pub token: String,
    pub http: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct GithubUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GithubUserMinimal {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GithubPullRequest {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    updated_at: String,
    user: GithubUserMinimal,
}

#[derive(Debug, Deserialize)]
struct GithubIssue {
    number: u64,
    title: String,
    html_url: String,
    state: String,
    updated_at: String,
    user: GithubUserMinimal,
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct CreatePrBody<'a> {
    title: &'a str,
    body: &'a str,
    head: &'a str,
    base: &'a str,
}

impl GithubClient {
    pub fn new(token: String) -> Result<Self, String> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static("PenguinGit"));
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github.v3+json"),
        );
        let auth_val = format!("Bearer {}", token.trim());
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&auth_val).map_err(|e| format!("Invalid token header: {e}"))?,
        );

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .map_err(|e| format!("Failed to build reqwest client: {e}"))?;

        Ok(Self { token, http })
    }

    pub async fn test_connection(&self) -> Result<String, String> {
        let res = self
            .http
            .get("https://api.github.com/user")
            .send()
            .await
            .map_err(|e| format!("HTTP request error: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("GitHub API error ({status}): {text}"));
        }

        let user: GithubUser = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse user response: {e}"))?;

        Ok(user.login)
    }

    pub async fn get_current_user_login(&self) -> Option<String> {
        self.test_connection().await.ok()
    }
}

impl GitHostClient for GithubClient {
    async fn search_prs(&self, owner: &str, repo: &str) -> Result<Vec<LaunchpadItem>, String> {
        let current_user = self.get_current_user_login().await.unwrap_or_default();
        let url =
            format!("https://api.github.com/repos/{owner}/{repo}/pulls?state=open&per_page=100");

        let res = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("GitHub API returned {}", res.status()));
        }

        let prs: Vec<GithubPullRequest> = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse PRs: {e}"))?;

        let repo_slug = format!("{owner}/{repo}");
        let mut items = Vec::new();

        for pr in prs {
            let category = categorize_pr(&pr.user.login, &current_user).to_string();

            items.push(LaunchpadItem {
                kind: "pr".to_string(),
                title: pr.title,
                number: pr.number,
                repo: repo_slug.clone(),
                url: pr.html_url,
                category,
                updated_at: pr.updated_at,
                author: pr.user.login,
                state: pr.state,
            });
        }

        Ok(items)
    }

    async fn get_pr(&self, owner: &str, repo: &str, number: u64) -> Result<LaunchpadItem, String> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls/{number}");
        let res = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("GitHub API returned {}", res.status()));
        }

        let pr: GithubPullRequest = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse PR: {e}"))?;

        let current_user = self.get_current_user_login().await.unwrap_or_default();

        let category = categorize_pr(&pr.user.login, &current_user).to_string();

        Ok(LaunchpadItem {
            kind: "pr".to_string(),
            title: pr.title,
            number: pr.number,
            repo: format!("{owner}/{repo}"),
            url: pr.html_url,
            category,
            updated_at: pr.updated_at,
            author: pr.user.login,
            state: pr.state,
        })
    }

    async fn create_pr(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: &str,
        head: &str,
        base: &str,
    ) -> Result<LaunchpadItem, String> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls");
        let payload = CreatePrBody {
            title,
            body,
            head,
            base,
        };

        let res = self
            .http
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Failed to create PR ({status}): {err_text}"));
        }

        let pr: GithubPullRequest = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse created PR: {e}"))?;

        Ok(LaunchpadItem {
            kind: "pr".to_string(),
            title: pr.title,
            number: pr.number,
            repo: format!("{owner}/{repo}"),
            url: pr.html_url,
            category: "Your PRs".to_string(),
            updated_at: pr.updated_at,
            author: pr.user.login,
            state: pr.state,
        })
    }

    async fn get_issues(&self, owner: &str, repo: &str) -> Result<Vec<LaunchpadItem>, String> {
        let url =
            format!("https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=100");

        let res = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("GitHub API returned {}", res.status()));
        }

        let raw_issues: Vec<GithubIssue> = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse issues: {e}"))?;

        let repo_slug = format!("{owner}/{repo}");
        let mut items = Vec::new();

        for issue in raw_issues {
            if issue.pull_request.is_some() {
                continue;
            }

            items.push(LaunchpadItem {
                kind: "issue".to_string(),
                title: issue.title,
                number: issue.number,
                repo: repo_slug.clone(),
                url: issue.html_url,
                category: "Issues".to_string(),
                updated_at: issue.updated_at,
                author: issue.user.login,
                state: issue.state,
            });
        }

        Ok(items)
    }

    async fn get_launchpad_items(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<LaunchpadItem>, String> {
        let mut all_items = Vec::new();

        if let Ok(mut prs) = self.search_prs(owner, repo).await {
            all_items.append(&mut prs);
        }

        if let Ok(mut issues) = self.get_issues(owner, repo).await {
            all_items.append(&mut issues);
        }

        Ok(all_items)
    }
}

pub(crate) fn categorize_pr(author: &str, current_user: &str) -> &'static str {
    if author == current_user {
        "Your PRs"
    } else {
        "Needs review"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_client_initialization_sets_auth_header() {
        let client = GithubClient::new("ghp_test123".to_string());
        assert!(client.is_ok());
        let client = client.unwrap();
        assert_eq!(client.token, "ghp_test123");
    }

    #[test]
    fn test_pr_categorization() {
        let current_user = "alice";

        // 1. Own draft PR
        assert_eq!(categorize_pr("alice", current_user), "Your PRs");

        // 2. Own non-draft / unreviewed PR
        assert_eq!(categorize_pr("alice", current_user), "Your PRs");

        // 3. Own approved PR
        assert_eq!(categorize_pr("alice", current_user), "Your PRs");

        // 4. Someone else's PR
        assert_eq!(categorize_pr("bob", current_user), "Needs review");
    }
}
