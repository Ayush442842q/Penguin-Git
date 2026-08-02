use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::ApiError,
    models::{Patch, PatchComment},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreatePatchRequest {
    pub title: String,
    pub description: Option<String>,
    pub patch_data: String,
    pub repo_name: Option<String>,
    pub base_commit: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub body: String,
}

pub async fn create_patch(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<CreatePatchRequest>,
) -> Result<(StatusCode, Json<Patch>), ApiError> {
    if payload.title.trim().is_empty() || payload.patch_data.trim().is_empty() {
        return Err(ApiError::BadRequest("Title and patch_data required".into()));
    }

    let patch = sqlx::query_as::<_, Patch>(
        "INSERT INTO patches (author_id, title, description, patch_data, repo_name, base_commit)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, author_id, title, description, patch_data, repo_name, base_commit, created_at",
    )
    .bind(auth_user.id)
    .bind(payload.title.trim())
    .bind(payload.description.as_deref().map(|s| s.trim()))
    .bind(&payload.patch_data)
    .bind(payload.repo_name.as_deref().map(|s| s.trim()))
    .bind(payload.base_commit.as_deref().map(|s| s.trim()))
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(patch)))
}

pub async fn list_patches(
    State(state): State<Arc<AppState>>,
    _auth_user: AuthUser,
) -> Result<Json<Vec<Patch>>, ApiError> {
    let patches = sqlx::query_as::<_, Patch>(
        "SELECT id, author_id, title, description, patch_data, repo_name, base_commit, created_at
         FROM patches
         ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(patches))
}

pub async fn get_patch(
    State(state): State<Arc<AppState>>,
    _auth_user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Patch>, ApiError> {
    let patch = sqlx::query_as::<_, Patch>(
        "SELECT id, author_id, title, description, patch_data, repo_name, base_commit, created_at
         FROM patches
         WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("Patch not found".into()))?;

    Ok(Json(patch))
}

pub async fn add_comment(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<PatchComment>), ApiError> {
    if payload.body.trim().is_empty() {
        return Err(ApiError::BadRequest("Comment body cannot be empty".into()));
    }

    // Verify patch exists
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM patches WHERE id = $1)")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    if !exists {
        return Err(ApiError::NotFound("Patch not found".into()));
    }

    let comment = sqlx::query_as::<_, PatchComment>(
        "INSERT INTO patch_comments (patch_id, author_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, patch_id, author_id, body, created_at",
    )
    .bind(id)
    .bind(auth_user.id)
    .bind(payload.body.trim())
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(comment)))
}

pub async fn list_comments(
    State(state): State<Arc<AppState>>,
    _auth_user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<PatchComment>>, ApiError> {
    let comments = sqlx::query_as::<_, PatchComment>(
        "SELECT id, patch_id, author_id, body, created_at
         FROM patch_comments
         WHERE patch_id = $1
         ORDER BY created_at ASC",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(comments))
}
