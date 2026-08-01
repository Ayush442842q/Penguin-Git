use std::path::Path;

use serde::{Deserialize, Serialize};

use super::exec::{run_git, GitError};

/// How a single path changed, normalized from git's two-character XY status codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Untracked,
    Ignored,
    Conflicted,
}

impl ChangeKind {
    /// Maps one half of git's XY status pair. Porcelain v2 uses the same letters
    /// for the staged (X) and unstaged (Y) columns.
    fn from_code(code: char) -> Option<Self> {
        match code {
            'A' => Some(Self::Added),
            'M' => Some(Self::Modified),
            'D' => Some(Self::Deleted),
            'R' => Some(Self::Renamed),
            'C' => Some(Self::Copied),
            'T' => Some(Self::TypeChanged),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub kind: ChangeKind,
    /// Populated for renames and copies: where the content came from.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_path: Option<String>,
    /// Rename/copy similarity score (0-100), as reported by git.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub similarity: Option<u8>,
}

impl FileEntry {
    fn new(path: impl Into<String>, kind: ChangeKind) -> Self {
        Self {
            path: path.into(),
            kind,
            original_path: None,
            similarity: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub untracked: Vec<FileEntry>,
    pub conflicted: Vec<FileEntry>,
}

impl RepoStatus {
    pub fn is_clean(&self) -> bool {
        self.staged.is_empty()
            && self.unstaged.is_empty()
            && self.untracked.is_empty()
            && self.conflicted.is_empty()
    }
}

/// Reads the working tree status.
///
/// Uses `--porcelain=v2` rather than v1: v1 renders renames as `R  old -> new`,
/// which is ambiguous for paths containing " -> ", and it does not distinguish
/// the various unmerged states. v2 gives explicit, separately-delimited fields.
/// `-z` makes every record NUL-terminated so paths with spaces or newlines
/// survive intact.
pub fn get_status(repo_path: &Path) -> Result<RepoStatus, GitError> {
    let raw = run_git(
        repo_path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
            "-z",
        ],
    )?;
    Ok(parse_porcelain_v2(&raw))
}

/// Parses `git status --porcelain=v2 --branch -z` output.
///
/// Kept as a pure function over the raw bytes-as-string so it can be tested
/// against hand-constructed fixtures for shapes that are awkward to produce
/// with a real repo (e.g. every unmerged variant).
///
/// Record layout, NUL-separated:
///   `# branch.<field> <value>`         — header lines
///   `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`            — ordinary change
///   `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>` — rename/copy,
///        followed by the *original* path as its own NUL-terminated field
///   `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`  — unmerged
///   `? <path>` / `! <path>`                                    — untracked/ignored
pub fn parse_porcelain_v2(raw: &str) -> RepoStatus {
    let mut status = RepoStatus::default();
    // `-z` NUL-terminates records, but rename entries emit the original path as a
    // *separate* field, so we consume the iterator manually rather than mapping it.
    let mut fields = raw.split('\0').filter(|f| !f.is_empty());

    while let Some(record) = fields.next() {
        match record.chars().next() {
            Some('#') => parse_branch_header(record, &mut status),
            Some('1') => {
                if let Some(entry) = parse_ordinary(record) {
                    push_entry(&mut status, entry);
                }
            }
            Some('2') => {
                // The original path is the next NUL-terminated field, not part of
                // this record — this is precisely what porcelain v1 got wrong.
                let original = fields.next().unwrap_or_default().to_string();
                if let Some(entry) = parse_rename(record, original) {
                    push_entry(&mut status, entry);
                }
            }
            Some('u') => {
                if let Some(path) = record.split(' ').nth(10) {
                    status
                        .conflicted
                        .push(FileEntry::new(path, ChangeKind::Conflicted));
                }
            }
            Some('?') => {
                if let Some(path) = record.strip_prefix("? ") {
                    status
                        .untracked
                        .push(FileEntry::new(path, ChangeKind::Untracked));
                }
            }
            Some('!') => { /* ignored files — deliberately not surfaced */ }
            _ => {}
        }
    }

    status
}

fn parse_branch_header(record: &str, status: &mut RepoStatus) {
    let Some(rest) = record.strip_prefix("# ") else {
        return;
    };
    let mut parts = rest.splitn(2, ' ');
    let (Some(key), Some(value)) = (parts.next(), parts.next()) else {
        return;
    };

    match key {
        // git reports "(detached)" rather than omitting the field.
        "branch.head" if value != "(detached)" => status.branch = Some(value.to_string()),
        "branch.upstream" => status.upstream = Some(value.to_string()),
        "branch.ab" => {
            // Format: "+<ahead> -<behind>"
            for token in value.split_whitespace() {
                let (sign, digits) = token.split_at(1);
                let n = digits.parse().unwrap_or(0);
                match sign {
                    "+" => status.ahead = n,
                    "-" => status.behind = n,
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

/// `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
fn parse_ordinary(record: &str) -> Option<StagedUnstaged> {
    let mut parts = record.splitn(9, ' ');
    parts.next()?; // discard the '1' marker
    let xy = parts.next()?;
    // Fields 3..8 are submodule state and file modes/hashes — unused here.
    let path = parts.nth(6)?;
    Some(StagedUnstaged {
        staged: staged_half(xy).map(|k| FileEntry::new(path, k)),
        unstaged: unstaged_half(xy).map(|k| FileEntry::new(path, k)),
    })
}

/// `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>`
fn parse_rename(record: &str, original: String) -> Option<StagedUnstaged> {
    let mut parts = record.splitn(10, ' ');
    parts.next()?; // discard the '2' marker
    let xy = parts.next()?;
    let score_field = parts.nth(6)?; // e.g. "R100" or "C75"
    let path = parts.next()?;

    let similarity = score_field
        .get(1..)
        .and_then(|digits| digits.parse::<u8>().ok());

    let decorate = |kind: ChangeKind| FileEntry {
        path: path.to_string(),
        kind,
        original_path: Some(original.clone()),
        similarity,
    };

    Some(StagedUnstaged {
        staged: staged_half(xy).map(decorate),
        unstaged: unstaged_half(xy).map(decorate),
    })
}

/// A single path can appear in both columns at once — e.g. `MM` means "staged
/// modification, plus further unstaged edits on top". Both halves are kept so
/// the staging UI can show the file in each list independently.
struct StagedUnstaged {
    staged: Option<FileEntry>,
    unstaged: Option<FileEntry>,
}

fn staged_half(xy: &str) -> Option<ChangeKind> {
    ChangeKind::from_code(xy.chars().next()?)
}

fn unstaged_half(xy: &str) -> Option<ChangeKind> {
    ChangeKind::from_code(xy.chars().nth(1)?)
}

fn push_entry(status: &mut RepoStatus, entry: StagedUnstaged) {
    if let Some(staged) = entry.staged {
        status.staged.push(staged);
    }
    if let Some(unstaged) = entry.unstaged {
        status.unstaged.push(unstaged);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn clean_repo_reports_nothing() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "hello", "Initial commit");

        let status = get_status(repo.path()).expect("status should succeed");

        assert!(status.is_clean());
        assert_eq!(status.branch.as_deref(), Some("main"));
    }

    #[test]
    fn separates_staged_unstaged_and_untracked() {
        let repo = FixtureRepo::new();
        repo.commit("tracked.txt", "one", "Initial commit");

        repo.write("tracked.txt", "two");
        repo.git(&["add", "tracked.txt"]);
        repo.write("tracked.txt", "three"); // further edits on top of the staged copy
        repo.write("brand-new.txt", "hi");

        let status = get_status(repo.path()).expect("status should succeed");

        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].kind, ChangeKind::Modified);
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].kind, ChangeKind::Modified);
        assert_eq!(status.untracked.len(), 1);
        assert_eq!(status.untracked[0].path, "brand-new.txt");
    }

    #[test]
    fn detects_renames_with_original_path() {
        let repo = FixtureRepo::new();
        repo.commit(
            "before.txt",
            "content that stays identical\n",
            "Initial commit",
        );
        repo.git(&["mv", "before.txt", "after.txt"]);

        let status = get_status(repo.path()).expect("status should succeed");

        let renamed = status
            .staged
            .iter()
            .find(|e| e.kind == ChangeKind::Renamed)
            .expect("the rename should be detected");
        assert_eq!(renamed.path, "after.txt");
        assert_eq!(renamed.original_path.as_deref(), Some("before.txt"));
        assert_eq!(renamed.similarity, Some(100));
    }

    #[test]
    fn paths_with_spaces_survive_nul_delimiting() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("a file with spaces.txt", "hi");

        let status = get_status(repo.path()).expect("status should succeed");

        assert_eq!(status.untracked[0].path, "a file with spaces.txt");
    }

    #[test]
    fn reports_conflicted_files_during_a_merge() {
        let repo = FixtureRepo::new();
        repo.commit("conflict.txt", "base\n", "Initial commit");

        repo.git(&["checkout", "-b", "other"]);
        repo.write("conflict.txt", "from other branch\n");
        repo.git(&["add", "conflict.txt"]);
        repo.commit_all("Change on other");

        repo.git(&["checkout", "main"]);
        repo.write("conflict.txt", "from main\n");
        repo.git(&["add", "conflict.txt"]);
        repo.commit_all("Change on main");

        // Expected to fail — that's the point, it leaves the tree conflicted.
        let _ = std::process::Command::new("git")
            .current_dir(repo.path())
            .args(["merge", "other"])
            .output();

        let status = get_status(repo.path()).expect("status should succeed mid-merge");

        assert_eq!(
            status.conflicted.len(),
            1,
            "expected exactly one conflicted path"
        );
        assert_eq!(status.conflicted[0].path, "conflict.txt");
        assert_eq!(status.conflicted[0].kind, ChangeKind::Conflicted);
    }

    #[test]
    fn parses_ahead_behind_from_branch_header() {
        // Hand-built fixture: reproducing a diverged upstream through a real repo
        // is slow, and this exercises the header parser precisely.
        let raw = "# branch.oid abc123\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +3 -5\0";

        let status = parse_porcelain_v2(raw);

        assert_eq!(status.branch.as_deref(), Some("main"));
        assert_eq!(status.upstream.as_deref(), Some("origin/main"));
        assert_eq!(status.ahead, 3);
        assert_eq!(status.behind, 5);
    }

    #[test]
    fn detached_head_reports_no_branch() {
        let raw = "# branch.oid abc123\0# branch.head (detached)\0";
        assert_eq!(parse_porcelain_v2(raw).branch, None);
    }
}
