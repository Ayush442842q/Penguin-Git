//! Local workspaces management.
//!
//! Stores named groups of local repo paths in the SAME SQLite database as the
//! Phase 3 `RepoRegistry`.

use serde::{Deserialize, Serialize};

use super::repo_registry::{RegisteredRepo, RepoRegistry};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWorkspace {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

impl RepoRegistry {
    pub fn create_workspace(&self, name: &str) -> Result<LocalWorkspace, rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        let id = format!("ws_{}", uuid::Uuid::new_v4().simple());
        let created_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO workspaces (id, name, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name.trim(), created_at],
        )?;

        Ok(LocalWorkspace {
            id,
            name: name.trim().to_string(),
            created_at,
        })
    }

    pub fn rename_workspace(&self, id: &str, new_name: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            rusqlite::params![new_name.trim(), id],
        )?;
        Ok(())
    }

    pub fn delete_workspace(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        conn.execute("DELETE FROM workspaces WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    pub fn list_workspaces(&self) -> Result<Vec<LocalWorkspace>, rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        let mut stmt = conn.prepare("SELECT id, name, created_at FROM workspaces ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(LocalWorkspace {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn add_repo_to_workspace(
        &self,
        workspace_id: &str,
        repo_id: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        let added_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO workspace_repos (workspace_id, repo_id, added_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(workspace_id, repo_id) DO NOTHING",
            rusqlite::params![workspace_id, repo_id, added_at],
        )?;
        Ok(())
    }

    pub fn remove_repo_from_workspace(
        &self,
        workspace_id: &str,
        repo_id: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        conn.execute(
            "DELETE FROM workspace_repos WHERE workspace_id = ?1 AND repo_id = ?2",
            rusqlite::params![workspace_id, repo_id],
        )?;
        Ok(())
    }

    pub fn list_workspace_repos(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<RegisteredRepo>, rusqlite::Error> {
        let conn = self.conn.lock().expect("registry db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT r.id, r.path, r.display_name, r.last_opened_at, r.kind, r.primary_repo_id
             FROM repos r
             INNER JOIN workspace_repos wr ON r.id = wr.repo_id
             WHERE wr.workspace_id = ?1
             ORDER BY r.display_name ASC",
        )?;

        let rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
            Ok(RegisteredRepo {
                id: row.get(0)?,
                path: row.get(1)?,
                display_name: row.get(2)?,
                last_opened_at: row.get(3)?,
                kind: row.get(4)?,
                primary_repo_id: row.get(5)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_crud_and_repo_associations() {
        let registry = RepoRegistry::open_in_memory().expect("open memory db");

        // 1. Create workspace
        let ws1 = registry.create_workspace("Backend Repos").unwrap();
        assert_eq!(ws1.name, "Backend Repos");

        let ws2 = registry.create_workspace("Frontend Repos").unwrap();
        assert_eq!(ws2.name, "Frontend Repos");

        let list = registry.list_workspaces().unwrap();
        assert_eq!(list.len(), 2);

        // 2. Add repo to registry
        let repo = RegisteredRepo {
            id: "/repo1".to_string(),
            path: "/repo1".to_string(),
            display_name: "repo1".to_string(),
            last_opened_at: "2026-08-03T00:00:00Z".to_string(),
            kind: "plain".to_string(),
            primary_repo_id: None,
        };
        registry.upsert_repo(&repo).unwrap();

        // 3. Associate repo with ws1
        registry.add_repo_to_workspace(&ws1.id, &repo.id).unwrap();
        let ws1_repos = registry.list_workspace_repos(&ws1.id).unwrap();
        assert_eq!(ws1_repos.len(), 1);
        assert_eq!(ws1_repos[0].id, repo.id);

        let ws2_repos = registry.list_workspace_repos(&ws2.id).unwrap();
        assert_eq!(ws2_repos.len(), 0);

        // 4. Rename workspace
        registry.rename_workspace(&ws1.id, "Core Services").unwrap();
        let list_after_rename = registry.list_workspaces().unwrap();
        let renamed = list_after_rename.iter().find(|w| w.id == ws1.id).unwrap();
        assert_eq!(renamed.name, "Core Services");

        // 5. Remove repo from workspace
        registry.remove_repo_from_workspace(&ws1.id, &repo.id).unwrap();
        assert_eq!(registry.list_workspace_repos(&ws1.id).unwrap().len(), 0);

        // 6. Delete workspace
        registry.delete_workspace(&ws2.id).unwrap();
        assert_eq!(registry.list_workspaces().unwrap().len(), 1);
    }
}
