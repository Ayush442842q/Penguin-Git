use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    auth::{generate_opaque_token, hash_password, verify_password, AuthUser},
    error::ApiError,
    models::{User, UserPublic},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<UserPublic>), ApiError> {
    let username = payload.username.trim();
    if username.is_empty() || payload.password.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "Username and password required".into(),
        ));
    }

    let password_hash = hash_password(&payload.password)?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash)
         VALUES ($1, $2)
         RETURNING id, username, password_hash, created_at",
    )
    .bind(username)
    .bind(password_hash)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref db_err) if db_err.is_unique_violation() => {
            ApiError::BadRequest("Username already taken".into())
        }
        _ => ApiError::Sqlx(e),
    })?;

    Ok((
        StatusCode::CREATED,
        Json(UserPublic {
            id: user.id,
            username: user.username,
            created_at: user.created_at,
        }),
    ))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let username = payload.username.trim();
    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = $1",
    )
    .bind(username)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("Invalid username or password".into()))?;

    if !verify_password(&payload.password, &user.password_hash) {
        return Err(ApiError::Unauthorized(
            "Invalid username or password".into(),
        ));
    }

    let token_str = generate_opaque_token();
    let expires_at = chrono::Utc::now() + chrono::Duration::days(30);

    sqlx::query("INSERT INTO tokens (token, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(&token_str)
        .bind(user.id)
        .bind(expires_at)
        .execute(&state.db)
        .await?;

    Ok(Json(AuthResponse {
        token: token_str,
        user: UserPublic {
            id: user.id,
            username: user.username,
            created_at: user.created_at,
        },
    }))
}

pub async fn logout(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("DELETE FROM tokens WHERE token = $1")
        .bind(&auth_user.token)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
