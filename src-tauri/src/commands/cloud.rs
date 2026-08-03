use crate::core::cloud::{
    delete_cloud_config, get_cloud_config, save_cloud_config, CloudClient, CloudConfig, CloudPatch,
    CloudPatchComment, CloudWorkspace,
};

#[tauri::command]
pub async fn cloud_login(
    server_url: String,
    username: String,
    password: String,
) -> Result<String, String> {
    save_cloud_config(&server_url, None)?;
    let client = CloudClient::new(&server_url, None);
    client.login(&username, &password).await
}

#[tauri::command]
pub fn cloud_logout() -> Result<(), String> {
    delete_cloud_config()
}

#[tauri::command]
pub fn get_cloud_settings() -> Result<Option<CloudConfig>, String> {
    get_cloud_config()
}

#[tauri::command]
pub fn save_cloud_settings(server_url: String, token: Option<String>) -> Result<(), String> {
    save_cloud_config(&server_url, token.as_deref())
}

#[tauri::command]
pub async fn cloud_publish_patch(
    title: String,
    description: Option<String>,
    patch_data: String,
    repo_name: Option<String>,
    base_commit: Option<String>,
    workspace_id: Option<String>,
) -> Result<CloudPatch, String> {
    let client = CloudClient::from_saved_config()?;
    client
        .publish_patch(
            &title,
            description.as_deref(),
            &patch_data,
            repo_name.as_deref(),
            base_commit.as_deref(),
            workspace_id.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn cloud_list_patches() -> Result<Vec<CloudPatch>, String> {
    let client = CloudClient::from_saved_config()?;
    client.list_patches().await
}

#[tauri::command]
pub async fn cloud_add_comment(
    patch_id: String,
    body: String,
) -> Result<CloudPatchComment, String> {
    let client = CloudClient::from_saved_config()?;
    client.add_comment(&patch_id, &body).await
}

#[tauri::command]
pub async fn cloud_list_comments(patch_id: String) -> Result<Vec<CloudPatchComment>, String> {
    let client = CloudClient::from_saved_config()?;
    client.list_comments(&patch_id).await
}

#[tauri::command]
pub async fn cloud_create_workspace(name: String) -> Result<CloudWorkspace, String> {
    let client = CloudClient::from_saved_config()?;
    client.create_workspace(&name).await
}

#[tauri::command]
pub async fn cloud_list_workspaces() -> Result<Vec<CloudWorkspace>, String> {
    let client = CloudClient::from_saved_config()?;
    client.list_workspaces().await
}
