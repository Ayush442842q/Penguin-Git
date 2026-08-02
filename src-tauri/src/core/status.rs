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
                // `splitn(11, ..)` so the 11th field keeps the rest of the record
                // intact. A plain `split(' ').nth(10)` stops at the first space
                // *inside* the path, silently truncating "src/my file.txt".
                if let Some(path) = record.splitn(11, ' ').nth(10) {
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
        let _ = crate::core::branch::merge_branch(repo.path(), "other");

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
    fn conflicted_paths_with_spaces_are_not_truncated() {
        // An unmerged record: `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`.
        // The path is the 11th space-separated field and may itself contain spaces.
        let raw = "u UU N... 100644 100644 100644 100644 aaa bbb ccc src/my conflicted file.txt\0";

        let status = parse_porcelain_v2(raw);

        assert_eq!(status.conflicted.len(), 1);
        assert_eq!(status.conflicted[0].path, "src/my conflicted file.txt");
    }

    #[test]
    fn detached_head_reports_no_branch() {
        let raw = "# branch.oid abc123\0# branch.head (detached)\0";
        assert_eq!(parse_porcelain_v2(raw).branch, None);
    }

    // -- Change-kind mapping -------------------------------------------------

    /// An ordinary (`1`) record with the given XY pair, for one path.
    fn ordinary(xy: &str, path: &str) -> String {
        format!("1 {xy} N... 100644 100644 100644 aaaaaaa bbbbbbb {path}\0")
    }

    #[test]
    fn every_porcelain_status_letter_maps_to_a_change_kind() {
        let cases = [
            ("A.", ChangeKind::Added),
            ("M.", ChangeKind::Modified),
            ("D.", ChangeKind::Deleted),
            ("R.", ChangeKind::Renamed),
            ("C.", ChangeKind::Copied),
            ("T.", ChangeKind::TypeChanged),
        ];

        for (xy, expected) in cases {
            let status = parse_porcelain_v2(&ordinary(xy, "f.txt"));
            assert_eq!(
                status.staged.first().map(|e| e.kind),
                Some(expected),
                "staged half of {xy:?}"
            );
            assert!(
                status.unstaged.is_empty(),
                "'.' in the unstaged column means no worktree change"
            );
        }
    }

    #[test]
    fn a_file_changed_in_both_columns_appears_in_both_lists() {
        // `MM` is "staged modification, plus further unstaged edits on top" — the
        // staging UI has to show it in each list independently, not pick one.
        let status = parse_porcelain_v2(&ordinary("MM", "both.txt"));

        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.staged[0].path, "both.txt");
        assert_eq!(status.unstaged[0].path, "both.txt");
        assert!(!status.is_clean());
    }

    #[test]
    fn an_unstaged_only_change_is_not_reported_as_staged() {
        let status = parse_porcelain_v2(&ordinary(".M", "worktree-only.txt"));

        assert!(status.staged.is_empty());
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].kind, ChangeKind::Modified);
    }

    #[test]
    fn ignored_files_are_never_surfaced() {
        // Listing ignored files would drown the real changes — build output alone
        // can run to thousands of paths.
        let raw = "! target/debug/penguingit\0! node_modules/react/index.js\0? real.txt\0";

        let status = parse_porcelain_v2(raw);

        assert_eq!(status.untracked.len(), 1);
        assert_eq!(status.untracked[0].path, "real.txt");
    }

    #[test]
    fn unrecognised_records_are_skipped_rather_than_derailing_the_parse() {
        // Forward-compatibility: a future git adding a record type must not cost
        // us the records around it.
        let raw = format!(
            "x some future record\0{}? after.txt\0",
            ordinary("M.", "before.txt")
        );

        let status = parse_porcelain_v2(&raw);

        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "before.txt");
        assert_eq!(status.untracked[0].path, "after.txt");
    }

    #[test]
    fn a_copy_carries_its_source_and_similarity_score() {
        let raw = "2 C. N... 100644 100644 100644 aaaaaaa bbbbbbb C75 copy.txt\0original.txt\0";

        let status = parse_porcelain_v2(raw);

        let copied = &status.staged[0];
        assert_eq!(copied.kind, ChangeKind::Copied);
        assert_eq!(copied.path, "copy.txt");
        assert_eq!(copied.original_path.as_deref(), Some("original.txt"));
        assert_eq!(copied.similarity, Some(75));
    }

    #[test]
    fn a_renamed_path_containing_spaces_keeps_both_halves() {
        // The original path is a *separate* NUL field, which is exactly what
        // porcelain v1's `R old -> new` cannot express unambiguously.
        let raw = "2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 docs/new name.md\0docs/old name.md\0";

        let status = parse_porcelain_v2(raw);

        assert_eq!(status.staged[0].path, "docs/new name.md");
        assert_eq!(
            status.staged[0].original_path.as_deref(),
            Some("docs/old name.md")
        );
    }

    #[test]
    fn a_malformed_branch_header_does_not_poison_the_counts() {
        let raw = "# branch.ab garbage\0# branch.head main\0";

        let status = parse_porcelain_v2(raw);

        assert_eq!((status.ahead, status.behind), (0, 0));
        assert_eq!(status.branch.as_deref(), Some("main"));
    }

    // -- Against a real repository ------------------------------------------

    #[test]
    fn a_deleted_file_is_reported_as_deleted() {
        let repo = FixtureRepo::new();
        repo.commit("gone.txt", "bye\n", "Initial commit");
        std::fs::remove_file(repo.file_path("gone.txt")).expect("remove");

        let status = get_status(repo.path()).expect("status");

        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].kind, ChangeKind::Deleted);
        assert_eq!(status.unstaged[0].path, "gone.txt");
    }

    #[test]
    fn replacing_a_file_with_a_symlink_reports_a_type_change() {
        let repo = FixtureRepo::new();
        repo.commit("link.txt", "regular file\n", "Initial commit");
        std::fs::remove_file(repo.file_path("link.txt")).expect("remove");
        std::os::unix::fs::symlink("/etc/hostname", repo.file_path("link.txt"))
            .expect("create symlink");

        let status = get_status(repo.path()).expect("status");

        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].kind, ChangeKind::TypeChanged);
    }

    #[test]
    fn nested_untracked_files_are_listed_individually() {
        // `--untracked-files=all` rather than the default `normal`, which collapses
        // a new directory to a single entry the user cannot stage selectively.
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("new-dir/one.txt", "1");
        repo.write("new-dir/nested/two.txt", "2");

        let status = get_status(repo.path()).expect("status");

        let mut paths: Vec<&str> = status.untracked.iter().map(|e| e.path.as_str()).collect();
        paths.sort_unstable();
        assert_eq!(paths, vec!["new-dir/nested/two.txt", "new-dir/one.txt"]);
    }

    #[test]
    fn detached_head_on_a_real_repo_reports_no_branch() {
        let repo = FixtureRepo::new();
        let sha = repo.commit("a.txt", "x", "Initial commit");
        repo.git(&["checkout", "--detach", &sha]);

        let status = get_status(repo.path()).expect("status");

        assert_eq!(status.branch, None);
        assert!(status.is_clean());
    }

    #[test]
    fn a_repo_with_no_commits_reports_its_staged_files() {
        // Before the first commit there is no HEAD to diff against; git reports
        // everything staged as an addition. The very first commit a user makes
        // goes through this path.
        let repo = FixtureRepo::new();
        repo.write("first.txt", "hello");
        repo.git(&["add", "first.txt"]);

        let status = get_status(repo.path()).expect("status must work before the first commit");

        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].kind, ChangeKind::Added);
        assert_eq!(status.branch.as_deref(), Some("main"));
    }
}
