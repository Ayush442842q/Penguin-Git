pub mod commands;
pub mod core;

use commands::repo::WatcherRegistry;
use core::repo::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .manage(WatcherRegistry::new())
        .invoke_handler(tauri::generate_handler![
            // repo
            commands::repo::open_repo,
            commands::repo::list_open_repos,
            commands::repo::close_repo,
            commands::repo::repo_path_for,
            // status
            commands::status::get_git_status,
            // log / graph
            commands::log::get_git_log,
            commands::log::get_commit_graph,
            // diff
            commands::diff::get_file_diff,
            commands::diff::get_untracked_diff,
            commands::diff::get_commit_diff,
            commands::diff::get_file_history,
            commands::diff::get_blame,
            // staging
            commands::stage::stage_file,
            commands::stage::stage_all,
            commands::stage::unstage_file,
            commands::stage::unstage_all,
            commands::stage::discard_file_changes,
            commands::stage::discard_untracked,
            // commits
            commands::commit::commit_changes,
            commands::commit::get_commit_message,
            commands::commit::cherry_pick,
            commands::commit::revert_commit,
            commands::commit::reset_to_commit,
            commands::commit::create_tag,
            commands::commit::delete_tag,
            // branches
            commands::branch::get_branches,
            commands::branch::create_branch,
            commands::branch::delete_branch,
            commands::branch::rename_branch,
            commands::branch::checkout,
            commands::branch::checkout_new_branch,
            commands::branch::merge_branch,
            commands::branch::rebase_onto,
            // remotes
            commands::remote::get_remotes,
            commands::remote::add_remote,
            commands::remote::remove_remote,
            commands::remote::set_remote_url,
            commands::remote::fetch,
            commands::remote::pull,
            commands::remote::push,
            // stash
            commands::stash::get_stashes,
            commands::stash::save_stash,
            commands::stash::get_stash_diff,
            commands::stash::apply_stash,
            commands::stash::pop_stash,
            commands::stash::drop_stash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PenguinGit");
}
