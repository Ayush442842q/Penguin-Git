use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredRepo {
    pub id: String,
    pub path: String,
    pub display_name: String,
    pub last_opened_at: String,
    pub kind: String,
    pub primary_repo_id: Option<String>,
}

/// SQLite-backed repository registry.
///
/// Stores recently opened repositories, their kinds (plain / worktree / submodule),
/// and relationships. Designed to be extensible for future Cloud Workspaces data.
pub struct RepoRegistry {
    pub(crate) conn: Mutex<rusqlite::Connection>,
}

impl RepoRegistry {
    pub fn open(db_path: &Path) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = rusqlite::Connection::open(db_path)?;
        let registry = Self {
            conn: Mutex::new(conn),
        };
        registry.init_schema()?;
        Ok(registry)
    }

    pub fn open_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = rusqlite::Connection::open_in_memory()?;
        let registry = Self {
            conn: Mutex::new(conn),
        };
        registry.init_schema()?;
        Ok(registry)
    }

    fn init_schema(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS repos (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                last_opened_at TEXT NOT NULL,
                kind TEXT NOT NULL,
                primary_repo_id TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_repos_last_opened ON repos(last_opened_at DESC);
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspace_repos (
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                repo_id TEXT NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY (workspace_id, repo_id)
            );",
        )?;
        Ok(())
    }

    pub fn upsert_repo(&self, repo: &RegisteredRepo) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        conn.execute(
            "INSERT INTO repos (id, path, display_name, last_opened_at, kind, primary_repo_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                path = excluded.path,
                display_name = excluded.display_name,
                last_opened_at = excluded.last_opened_at,
                kind = excluded.kind,
                primary_repo_id = excluded.primary_repo_id",
            rusqlite::params![
                repo.id,
                repo.path,
                repo.display_name,
                repo.last_opened_at,
                repo.kind,
                repo.primary_repo_id
            ],
        )?;
        Ok(())
    }

    pub fn list_recent(&self, limit: usize) -> Result<Vec<RegisteredRepo>, rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, path, display_name, last_opened_at, kind, primary_repo_id
             FROM repos
             ORDER BY last_opened_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit as i64], |row| {
            Ok(RegisteredRepo {
                id: row.get(0)?,
                path: row.get(1)?,
                display_name: row.get(2)?,
                last_opened_at: row.get(3)?,
                kind: row.get(4)?,
                primary_repo_id: row.get(5)?,
            })
        })?;

        let mut repos = Vec::new();
        for r in rows {
            repos.push(r?);
        }
        Ok(repos)
    }

    pub fn get_repo(&self, id: &str) -> Result<Option<RegisteredRepo>, rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, path, display_name, last_opened_at, kind, primary_repo_id
             FROM repos
             WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(rusqlite::params![id], |row| {
            Ok(RegisteredRepo {
                id: row.get(0)?,
                path: row.get(1)?,
                display_name: row.get(2)?,
                last_opened_at: row.get(3)?,
                kind: row.get(4)?,
                primary_repo_id: row.get(5)?,
            })
        })?;

        if let Some(res) = rows.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn remove_repo(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        conn.execute("DELETE FROM repos WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_in_memory_registry_crud() {
        let registry = RepoRegistry::open_in_memory().expect("open memory db");
        let repo = RegisteredRepo {
            id: "/path/to/repo1".to_string(),
            path: "/path/to/repo1".to_string(),
            display_name: "repo1".to_string(),
            last_opened_at: "2026-08-02T10:00:00Z".to_string(),
            kind: "plain".to_string(),
            primary_repo_id: None,
        };

        registry.upsert_repo(&repo).expect("upsert");

        let fetched = registry.get_repo(&repo.id).expect("get").expect("found");
        assert_eq!(fetched, repo);

        let list = registry.list_recent(10).expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].display_name, "repo1");

        registry.remove_repo(&repo.id).expect("remove");
        assert!(registry.get_repo(&repo.id).expect("get").is_none());
    }

    #[test]
    fn test_upsert_updates_last_opened_and_ordering() {
        let registry = RepoRegistry::open_in_memory().expect("open memory db");
        let r1 = RegisteredRepo {
            id: "/repo1".to_string(),
            path: "/repo1".to_string(),
            display_name: "repo1".to_string(),
            last_opened_at: "2026-08-02T10:00:00Z".to_string(),
            kind: "plain".to_string(),
            primary_repo_id: None,
        };
        let r2 = RegisteredRepo {
            id: "/repo2".to_string(),
            path: "/repo2".to_string(),
            display_name: "repo2".to_string(),
            last_opened_at: "2026-08-02T11:00:00Z".to_string(),
            kind: "plain".to_string(),
            primary_repo_id: None,
        };

        registry.upsert_repo(&r1).unwrap();
        registry.upsert_repo(&r2).unwrap();

        let recent = registry.list_recent(10).unwrap();
        assert_eq!(recent[0].id, "/repo2");
        assert_eq!(recent[1].id, "/repo1");

        // Update r1's timestamp
        let mut r1_updated = r1.clone();
        r1_updated.last_opened_at = "2026-08-02T12:00:00Z".to_string();
        registry.upsert_repo(&r1_updated).unwrap();

        let recent_after = registry.list_recent(10).unwrap();
        assert_eq!(recent_after[0].id, "/repo1");
        assert_eq!(recent_after[1].id, "/repo2");
    }
}
