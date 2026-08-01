use std::path::Path;

use super::to_ipc_error;
use crate::core::log::{compute_lanes, get_log, Commit, GraphLayout};

#[tauri::command]
pub fn get_git_log(repo_path: String, limit: usize) -> Result<Vec<Commit>, String> {
    get_log(Path::new(&repo_path), limit).map_err(to_ipc_error)
}

/// Commits plus their lane assignments, so the graph renders from one round trip.
#[tauri::command]
pub fn get_commit_graph(repo_path: String, limit: usize) -> Result<CommitGraph, String> {
    let commits = get_log(Path::new(&repo_path), limit).map_err(to_ipc_error)?;
    let layout = compute_lanes(&commits);
    Ok(CommitGraph { commits, layout })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitGraph {
    pub commits: Vec<Commit>,
    pub layout: GraphLayout,
}
