use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "penguingit";
const KEYRING_URL_USER: &str = "cloud_server_url";
const KEYRING_TOKEN_USER: &str = "cloud_token";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudConfig {
    pub server_url: String,
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUser {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPatch {
    pub id: String,
    pub author_id: String,
    pub title: String,
    pub description: Option<String>,
    pub patch_data: String,
    pub repo_name: Option<String>,
    pub base_commit: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPatchComment {
    pub id: String,
    pub patch_id: String,
    pub author_id: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudWorkspace {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub created_at: String,
}

pub fn save_cloud_config(server_url: &str, token: Option<&str>) -> Result<(), String> {
    let url_entry = Entry::new(KEYRING_SERVICE, KEYRING_URL_USER).map_err(|e| e.to_string())?;
    url_entry.set_password(server_url.trim()).map_err(|e| e.to_string())?;

    let token_entry = Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_USER).map_err(|e| e.to_string())?;
    match token {
        Some(t) if !t.trim().is_empty() => {
            token_entry.set_password(t.trim()).map_err(|e| e.to_string())?;
        }
        _ => {
            let _ = token_entry.delete_credential();
        }
    }
    Ok(())
}

pub fn get_cloud_config() -> Result<Option<CloudConfig>, String> {
    let url_entry = Entry::new(KEYRING_SERVICE, KEYRING_URL_USER).map_err(|e| e.to_string())?;
    let server_url = match url_entry.get_password() {
        Ok(url) => url,
        Err(_) => return Ok(None),
    };

    let token_entry = Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_USER).map_err(|e| e.to_string())?;
    let token = token_entry.get_password().ok();

    Ok(Some(CloudConfig { server_url, token }))
}

pub fn delete_cloud_config() -> Result<(), String> {
    let url_entry = Entry::new(KEYRING_SERVICE, KEYRING_URL_USER).map_err(|e| e.to_string())?;
    let _ = url_entry.delete_credential();

    let token_entry = Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_USER).map_err(|e| e.to_string())?;
    let _ = token_entry.delete_credential();

    Ok(())
}

pub struct CloudClient {
    client: Client,
    server_url: String,
    token: Option<String>,
}

impl CloudClient {
    pub fn new(server_url: &str, token: Option<&str>) -> Self {
        let trimmed_url = server_url.trim_end_matches('/');
        Self {
            client: Client::new(),
            server_url: trimmed_url.to_string(),
            token: token.map(|s| s.to_string()),
        }
    }

    pub fn from_saved_config() -> Result<Self, String> {
        let config = get_cloud_config()?
            .ok_or_else(|| "No cloud server configured in settings".to_string())?;
        Ok(Self::new(&config.server_url, config.token.as_deref()))
    }

    pub async fn login(&self, username: &str, password: &str) -> Result<String, String> {
        let url = format!("{}/api/auth/login", self.server_url);
        let res = self
            .client
            .post(&url)
            .json(&serde_json::json!({ "username": username, "password": password }))
            .send()
            .await
            .map_err(|e| format!("Network request failed: {e}"))?;

        if !res.status().is_success() {
            let err_body: serde_json::Value = res.json().await.unwrap_or_default();
            let msg = err_body["error"]
                .as_str()
                .unwrap_or("Authentication failed");
            return Err(msg.to_string());
        }

        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let token = body["token"]
            .as_str()
            .ok_or("Token missing from server response")?
            .to_string();

        save_cloud_config(&self.server_url, Some(&token))?;
        Ok(token)
    }

    pub async fn publish_patch(
        &self,
        title: &str,
        description: Option<&str>,
        patch_data: &str,
        repo_name: Option<&str>,
        base_commit: Option<&str>,
    ) -> Result<CloudPatch, String> {
        let token = self
            .token
            .as_ref()
            .ok_or("Not logged in to cloud server")?;
        let url = format!("{}/api/patches", self.server_url);

        let res = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&serde_json::json!({
                "title": title,
                "description": description,
                "patch_data": patch_data,
                "repo_name": repo_name,
                "base_commit": base_commit
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            let err_body: serde_json::Value = res.json().await.unwrap_or_default();
            return Err(err_body["error"].as_str().unwrap_or("Failed to publish patch").to_string());
        }

        res.json::<CloudPatch>().await.map_err(|e| e.to_string())
    }

    pub async fn list_patches(&self) -> Result<Vec<CloudPatch>, String> {
        let token = self.token.as_ref().ok_or("Not logged in to cloud server")?;
        let url = format!("{}/api/patches", self.server_url);

        let res = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err("Failed to fetch cloud patches".into());
        }

        res.json::<Vec<CloudPatch>>().await.map_err(|e| e.to_string())
    }

    pub async fn add_comment(&self, patch_id: &str, body: &str) -> Result<CloudPatchComment, String> {
        let token = self.token.as_ref().ok_or("Not logged in to cloud server")?;
        let url = format!("{}/api/patches/{patch_id}/comments", self.server_url);

        let res = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "body": body }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err("Failed to add comment".into());
        }

        res.json::<CloudPatchComment>().await.map_err(|e| e.to_string())
    }

    pub async fn list_comments(&self, patch_id: &str) -> Result<Vec<CloudPatchComment>, String> {
        let token = self.token.as_ref().ok_or("Not logged in to cloud server")?;
        let url = format!("{}/api/patches/{patch_id}/comments", self.server_url);

        let res = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err("Failed to fetch comments".into());
        }

        res.json::<Vec<CloudPatchComment>>().await.map_err(|e| e.to_string())
    }

    pub async fn create_workspace(&self, name: &str) -> Result<CloudWorkspace, String> {
        let token = self.token.as_ref().ok_or("Not logged in to cloud server")?;
        let url = format!("{}/api/workspaces", self.server_url);

        let res = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "name": name }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err("Failed to create cloud workspace".into());
        }

        res.json::<CloudWorkspace>().await.map_err(|e| e.to_string())
    }

    pub async fn list_workspaces(&self) -> Result<Vec<CloudWorkspace>, String> {
        let token = self.token.as_ref().ok_or("Not logged in to cloud server")?;
        let url = format!("{}/api/workspaces", self.server_url);

        let res = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err("Failed to fetch cloud workspaces".into());
        }

        res.json::<Vec<CloudWorkspace>>().await.map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cloud_client_url_formatting() {
        let client = CloudClient::new("http://localhost:3000/", Some("token123"));
        assert_eq!(client.server_url, "http://localhost:3000");
        assert_eq!(client.token.as_deref(), Some("token123"));
    }
}
