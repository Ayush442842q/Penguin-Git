use rmcp::schemars::JsonSchema;
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::ServerInfo,
    tool, tool_handler, tool_router, ServerHandler,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

use penguingit_lib::core::{branch, commit, diff, log, mcp_event, remote, stage, stash, status};

#[derive(Debug, Clone)]
pub struct PenguinMcpServer {
    tool_router: ToolRouter<Self>,
}

impl PenguinMcpServer {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }
}

impl Default for PenguinMcpServer {
    fn default() -> Self {
        Self::new()
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for PenguinMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            rmcp::model::ServerCapabilities::builder()
                .enable_tools()
                .build(),
        )
    }
}

// -- Input Schemas -----------------------------------------------------------

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitLogArgs {
    pub repo_path: String,
    pub limit: Option<usize>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitStatusArgs {
    pub repo_path: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitDiffArgs {
    pub repo_path: String,
    pub path: Option<String>,
    pub staged: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitCommitDiffArgs {
    pub repo_path: String,
    pub hash: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitStageFileArgs {
    pub repo_path: String,
    pub file_path: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitUnstageFileArgs {
    pub repo_path: String,
    pub file_path: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitCommitArgs {
    pub repo_path: String,
    pub message: String,
    pub body: Option<String>,
    pub amend: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitCheckoutArgs {
    pub repo_path: String,
    pub target: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitFetchArgs {
    pub repo_path: String,
    pub remote: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitPullArgs {
    pub repo_path: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitPushArgs {
    pub repo_path: String,
    pub remote: Option<String>,
    pub branch: Option<String>,
    pub force: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitBranchesArgs {
    pub repo_path: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitCreateBranchArgs {
    pub repo_path: String,
    pub name: String,
    pub start_point: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitDeleteBranchArgs {
    pub repo_path: String,
    pub name: String,
    pub force: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitStashesArgs {
    pub repo_path: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitStashSaveArgs {
    pub repo_path: String,
    pub message: Option<String>,
    pub include_untracked: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitStashPopArgs {
    pub repo_path: String,
    pub index: Option<usize>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct GitDiscardFileChangesArgs {
    pub repo_path: String,
    pub file_path: String,
}

// -- Tool Implementations ----------------------------------------------------

#[tool_router(router = tool_router)]
impl PenguinMcpServer {
    #[tool(description = "Get commit history log for a repository")]
    pub async fn git_log(&self, params: Parameters<GitLogArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let limit = args.limit.unwrap_or(500);
        let commits = log::get_log(path, limit).map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&commits).map_err(|e| e.to_string())
    }

    #[tool(description = "Get status of working tree and index")]
    pub async fn git_status(&self, params: Parameters<GitStatusArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let status = status::get_status(path).map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&status).map_err(|e| e.to_string())
    }

    #[tool(description = "Get diff for a file or the entire repository")]
    pub async fn git_diff(&self, params: Parameters<GitDiffArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let staged = args.staged.unwrap_or(false);
        if let Some(file_path) = args.path {
            diff::diff_file(path, &file_path, staged).map_err(|e| e.to_string())
        } else {
            diff::diff_repo(path, staged).map_err(|e| e.to_string())
        }
    }

    #[tool(description = "Get diff of a specific commit")]
    pub async fn git_commit_diff(
        &self,
        params: Parameters<GitCommitDiffArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        diff::diff_commit(path, &args.hash).map_err(|e| e.to_string())
    }

    #[tool(description = "Stage a file for commit")]
    pub async fn git_stage_file(
        &self,
        params: Parameters<GitStageFileArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        stage::stage_file(path, &args.file_path).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_stage_file", &args.repo_path).await;
        Ok(format!("Staged '{}'", args.file_path))
    }

    #[tool(description = "Unstage a file")]
    pub async fn git_unstage_file(
        &self,
        params: Parameters<GitUnstageFileArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        stage::unstage_file(path, &args.file_path).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_unstage_file", &args.repo_path).await;
        Ok(format!("Unstaged '{}'", args.file_path))
    }

    #[tool(description = "Create a new commit with staged changes")]
    pub async fn git_commit(&self, params: Parameters<GitCommitArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let amend = args.amend.unwrap_or(false);
        let commit_hash = commit::commit(path, &args.message, args.body.as_deref(), amend)
            .map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_commit", &args.repo_path).await;
        Ok(format!("Committed {}", commit_hash))
    }

    #[tool(description = "Checkout a branch or commit")]
    pub async fn git_checkout(
        &self,
        params: Parameters<GitCheckoutArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        branch::checkout(path, &args.target).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_checkout", &args.repo_path).await;
        Ok(format!("Switched to '{}'", args.target))
    }

    #[tool(description = "Fetch changes from remote repository")]
    pub async fn git_fetch(&self, params: Parameters<GitFetchArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        remote::fetch(path, args.remote.as_deref()).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_fetch", &args.repo_path).await;
        Ok("Fetched successfully".to_string())
    }

    #[tool(description = "Fetch and merge changes from remote repository")]
    pub async fn git_pull(&self, params: Parameters<GitPullArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        remote::pull(path).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_pull", &args.repo_path).await;
        Ok("Pulled successfully".to_string())
    }

    #[tool(description = "Push commits to remote repository")]
    pub async fn git_push(&self, params: Parameters<GitPushArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let force = args.force.unwrap_or(false);
        remote::push(path, args.remote.as_deref(), args.branch.as_deref(), force)
            .map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_push", &args.repo_path).await;
        Ok("Pushed successfully".to_string())
    }

    #[tool(description = "List all branches")]
    pub async fn git_branches(
        &self,
        params: Parameters<GitBranchesArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let branches = branch::list_branches(path).map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&branches).map_err(|e| e.to_string())
    }

    #[tool(description = "Create a new branch")]
    pub async fn git_create_branch(
        &self,
        params: Parameters<GitCreateBranchArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        branch::create_branch(path, &args.name, args.start_point.as_deref())
            .map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_create_branch", &args.repo_path).await;
        Ok(format!("Created branch '{}'", args.name))
    }

    #[tool(description = "Delete a branch")]
    pub async fn git_delete_branch(
        &self,
        params: Parameters<GitDeleteBranchArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let force = args.force.unwrap_or(false);
        branch::delete_branch(path, &args.name, force).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_delete_branch", &args.repo_path).await;
        Ok(format!("Deleted branch '{}'", args.name))
    }

    #[tool(description = "List all stashes")]
    pub async fn git_stashes(&self, params: Parameters<GitStashesArgs>) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let stashes = stash::list_stashes(path).map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&stashes).map_err(|e| e.to_string())
    }

    #[tool(description = "Save current changes to stash")]
    pub async fn git_stash_save(
        &self,
        params: Parameters<GitStashSaveArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let include_untracked = args.include_untracked.unwrap_or(false);
        stash::save_stash(path, args.message.as_deref(), include_untracked)
            .map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_stash_save", &args.repo_path).await;
        Ok("Saved stash".to_string())
    }

    #[tool(description = "Pop changes from stash")]
    pub async fn git_stash_pop(
        &self,
        params: Parameters<GitStashPopArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        let index = args.index.unwrap_or(0);
        let stashes = stash::list_stashes(path).map_err(|e| e.to_string())?;
        if stashes.len() <= index {
            return Err(format!("Stash index {} out of bounds", index));
        }
        let hash = &stashes[index].hash;
        stash::pop_stash(path, index, hash).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_stash_pop", &args.repo_path).await;
        Ok(format!("Popped stash@{{{}}}", index))
    }

    #[tool(description = "Discard working tree changes to a file")]
    pub async fn git_discard_file_changes(
        &self,
        params: Parameters<GitDiscardFileChangesArgs>,
    ) -> Result<String, String> {
        let args = params.0;
        let path = Path::new(&args.repo_path);
        stage::discard_file_changes(path, &args.file_path).map_err(|e| e.to_string())?;
        mcp_event::notify_mcp_mutation("git_discard_file_changes", &args.repo_path).await;
        Ok(format!("Discarded changes to '{}'", args.file_path))
    }
}
