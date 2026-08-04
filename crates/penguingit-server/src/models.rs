use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct Token {
    pub token: String,
    pub user_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    pub id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub author_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub patch_data: String,
    pub repo_name: Option<String>,
    pub base_commit: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PatchComment {
    pub id: Uuid,
    pub patch_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMember {
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepo {
    pub workspace_id: Uuid,
    pub repo_name: String,
    pub added_at: DateTime<Utc>,
}
