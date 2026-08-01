use std::path::Path;

use serde::{Deserialize, Serialize};

use super::exec::{run_git, GitError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub fetch_url: String,
    pub push_url: String,
}

/// Lists configured remotes with their fetch and push URLs.
///
/// `remote -v` emits two lines per remote (`(fetch)` and `(push)`), which are
/// folded back together here so a remote with a separate pushurl is represented
/// once rather than twice.
pub fn list_remotes(repo_path: &Path) -> Result<Vec<Remote>, GitError> {
    let raw = run_git(repo_path, &["remote", "-v"])?;
    let mut remotes: Vec<Remote> = Vec::new();

    for line in raw.lines().filter(|l| !l.trim().is_empty()) {
        // "<name>\t<url> (fetch|push)"
        let mut parts = line.split_whitespace();
        let (Some(name), Some(url), Some(kind)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };

        match remotes.iter_mut().find(|r| r.name == name) {
            Some(existing) => {
                if kind == "(push)" {
                    existing.push_url = url.to_string();
                }
            }
            None => remotes.push(Remote {
                name: name.to_string(),
                fetch_url: url.to_string(),
                push_url: url.to_string(),
            }),
        }
    }

    Ok(remotes)
}

pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<(), GitError> {
    run_git(repo_path, &["remote", "add", name, url])?;
    Ok(())
}

pub fn remove_remote(repo_path: &Path, name: &str) -> Result<(), GitError> {
    run_git(repo_path, &["remote", "remove", name])?;
    Ok(())
}

pub fn rename_remote(repo_path: &Path, old: &str, new: &str) -> Result<(), GitError> {
    run_git(repo_path, &["remote", "rename", old, new])?;
    Ok(())
}

pub fn set_remote_url(repo_path: &Path, name: &str, url: &str) -> Result<(), GitError> {
    run_git(repo_path, &["remote", "set-url", name, url])?;
    Ok(())
}

/// Fetches from `remote`, or from all remotes when none is named.
///
/// `--prune` drops remote-tracking refs whose upstream branch was deleted,
/// which otherwise linger in the branch list forever.
pub fn fetch(repo_path: &Path, remote: Option<&str>) -> Result<(), GitError> {
    match remote {
        Some(remote) => run_git(repo_path, &["fetch", "--prune", remote])?,
        None => run_git(repo_path, &["fetch", "--prune", "--all"])?,
    };
    Ok(())
}

pub fn pull(repo_path: &Path) -> Result<(), GitError> {
    run_git(repo_path, &["pull", "--no-edit"])?;
    Ok(())
}

/// Pushes the current branch.
///
/// `set_upstream` sends `-u` for a branch that has no upstream yet — pushing
/// without it would fail on the first push of a new branch.
pub fn push(
    repo_path: &Path,
    remote: Option<&str>,
    branch: Option<&str>,
    set_upstream: bool,
) -> Result<(), GitError> {
    let mut args = vec!["push"];
    if set_upstream {
        args.push("-u");
    }
    if let Some(remote) = remote {
        args.push(remote);
        if let Some(branch) = branch {
            args.push(branch);
        }
    }
    run_git(repo_path, &args)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn lists_a_remote_once_not_twice() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        let _bare = repo.add_bare_remote("origin");

        let remotes = list_remotes(repo.path()).expect("list");

        assert_eq!(
            remotes.len(),
            1,
            "fetch and push lines must fold into one entry"
        );
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[0].fetch_url, remotes[0].push_url);
    }

    #[test]
    fn add_rename_and_remove_a_remote() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");

        add_remote(repo.path(), "upstream", "https://example.invalid/repo.git").expect("add");
        assert_eq!(list_remotes(repo.path()).unwrap().len(), 1);

        rename_remote(repo.path(), "upstream", "canonical").expect("rename");
        assert_eq!(list_remotes(repo.path()).unwrap()[0].name, "canonical");

        set_remote_url(
            repo.path(),
            "canonical",
            "https://example.invalid/other.git",
        )
        .expect("set-url");
        assert!(list_remotes(repo.path()).unwrap()[0]
            .fetch_url
            .ends_with("other.git"));

        remove_remote(repo.path(), "canonical").expect("remove");
        assert!(list_remotes(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn push_and_fetch_round_trip_against_a_real_bare_remote() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        let bare = repo.add_bare_remote("origin");

        push(repo.path(), Some("origin"), Some("main"), true).expect("push");

        // The bare repo should now hold the same commit.
        let remote_head = std::process::Command::new("git")
            .current_dir(bare.path())
            .args(["rev-parse", "main"])
            .output()
            .expect("rev-parse in bare repo");
        let remote_head = String::from_utf8_lossy(&remote_head.stdout)
            .trim()
            .to_string();
        assert_eq!(remote_head, repo.head());

        fetch(repo.path(), Some("origin")).expect("fetch");
    }
}
