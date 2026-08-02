import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.hoisted(() => vi.fn(() => Promise.resolve("ok")));
const listen = vi.hoisted(() => vi.fn(() => Promise.resolve(() => {})));
const openDialog = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openDialog }));

import * as git from "./tauriBridge";
import { BRIDGE_FUNCTIONS } from "../test/bridgeMock";

/**
 * Contract tests for the IPC boundary.
 *
 * Nothing else checks that a wrapper names the right Rust command with the
 * right argument keys: Tauri resolves both at runtime, so a rename on either
 * side fails as an obscure error deep in a component rather than at build time.
 * These assertions are the only place that mismatch is caught.
 */
describe("tauriBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue("ok");
  });

  it("keeps the test stub in step with the real module", () => {
    // If a wrapper is added without updating bridgeMock, every component test
    // silently exercises an undefined function instead of a spy.
    const realFunctions = Object.entries(git)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();

    expect(realFunctions).toEqual([...BRIDGE_FUNCTIONS].sort());
  });

  describe("command names and argument keys", () => {
    const cases = [
      ["openRepo", () => git.openRepo("/r"), "open_repo", { path: "/r" }],
      ["closeRepo", () => git.closeRepo("/r"), "close_repo", { repoId: "/r" }],
      ["getStatus", () => git.getStatus("/r"), "get_git_status", { repoPath: "/r" }],
      ["getLog", () => git.getLog("/r", 10), "get_git_log", { repoPath: "/r", limit: 10 }],
      [
        "getCommitGraph",
        () => git.getCommitGraph("/r", 25),
        "get_commit_graph",
        { repoPath: "/r", limit: 25 },
      ],
      [
        "getFileDiff",
        () => git.getFileDiff("/r", "a.txt", true),
        "get_file_diff",
        { repoPath: "/r", path: "a.txt", staged: true },
      ],
      [
        "getCommitDiff",
        () => git.getCommitDiff("/r", "abc"),
        "get_commit_diff",
        { repoPath: "/r", hash: "abc" },
      ],
      [
        "getBlame",
        () => git.getBlame("/r", "a.txt"),
        "get_blame",
        { repoPath: "/r", path: "a.txt" },
      ],
      [
        "stageFile",
        () => git.stageFile("/r", "a.txt"),
        "stage_file",
        { repoPath: "/r", path: "a.txt" },
      ],
      ["stageAll", () => git.stageAll("/r"), "stage_all", { repoPath: "/r" }],
      [
        "discardFileChanges",
        () => git.discardFileChanges("/r", "a.txt"),
        "discard_file_changes",
        { repoPath: "/r", path: "a.txt" },
      ],
      [
        "resetToCommit",
        () => git.resetToCommit("/r", "abc", "hard"),
        "reset_to_commit",
        { repoPath: "/r", hash: "abc", mode: "hard" },
      ],
      ["getBranches", () => git.getBranches("/r"), "get_branches", { repoPath: "/r" }],
      [
        "checkout",
        () => git.checkout("/r", "main"),
        "checkout",
        { repoPath: "/r", target: "main" },
      ],
      [
        "mergeBranch",
        () => git.mergeBranch("/r", "feature"),
        "merge_branch",
        { repoPath: "/r", branchName: "feature" },
      ],
      ["pull", () => git.pull("/r"), "pull", { repoPath: "/r" }],
      ["getStashes", () => git.getStashes("/r"), "get_stashes", { repoPath: "/r" }],
      ["listRecentRepos", () => git.listRecentRepos(), "list_recent_repos", undefined],
      ["forgetRecentRepo", () => git.forgetRecentRepo("/r"), "forget_recent_repo", { id: "/r" }],
      ["getSubmodules", () => git.getSubmodules("/r"), "get_submodules", { repoPath: "/r" }],
      [
        "initSubmodule",
        () => git.initSubmodule("/r", "sub"),
        "init_submodule",
        { repoPath: "/r", submodulePath: "sub" },
      ],
      [
        "updateSubmodule",
        () => git.updateSubmodule("/r", "sub"),
        "update_submodule",
        { repoPath: "/r", submodulePath: "sub" },
      ],
    ];

    it.each(cases)("%s", (_name, call, expectedCommand, expectedArgs) => {
      call();
      if (expectedArgs !== undefined) {
        expect(invoke).toHaveBeenCalledWith(expectedCommand, expectedArgs);
      } else {
        expect(invoke).toHaveBeenCalledWith(expectedCommand);
      }
    });
  });

  describe("stash operations carry the entry hash", () => {
    // The index alone is not safe: positions renumber on every push/pop/drop.
    it.each([
      ["applyStash", git.applyStash, "apply_stash"],
      ["popStash", git.popStash, "pop_stash"],
      ["dropStash", git.dropStash, "drop_stash"],
    ])("%s sends index and hash", (_name, fn, command) => {
      fn("/r", 2, "deadbeef");
      expect(invoke).toHaveBeenCalledWith(command, {
        repoPath: "/r",
        index: 2,
        hash: "deadbeef",
      });
    });

    it("keeps apply and pop as distinct commands", () => {
      git.applyStash("/r", 0, "h");
      git.popStash("/r", 0, "h");

      const commands = invoke.mock.calls.map(([name]) => name);
      expect(commands).toEqual(["apply_stash", "pop_stash"]);
    });
  });

  describe("optional arguments become null, not undefined", () => {
    // `undefined` is dropped during IPC serialization, so a Rust `Option<String>`
    // parameter would go missing entirely rather than arriving as `None`.
    it("normalizes an omitted commit body", () => {
      git.commitChanges("/r", "subject", "");
      expect(invoke).toHaveBeenCalledWith("commit_changes", {
        repoPath: "/r",
        subject: "subject",
        body: null,
        amend: false,
      });
    });

    it("normalizes an omitted branch start point", () => {
      git.createBranch("/r", "spike");
      expect(invoke).toHaveBeenCalledWith("create_branch", {
        repoPath: "/r",
        name: "spike",
        startPoint: null,
      });
    });

    it("normalizes an omitted remote name", () => {
      git.fetch("/r");
      expect(invoke).toHaveBeenCalledWith("fetch", { repoPath: "/r", remoteName: null });
    });

    it("normalizes omitted push targets", () => {
      git.push("/r");
      expect(invoke).toHaveBeenCalledWith("push", {
        repoPath: "/r",
        remoteName: null,
        branchName: null,
        setUpstream: false,
      });
    });

    it("normalizes an omitted stash message", () => {
      git.saveStash("/r", "");
      expect(invoke).toHaveBeenCalledWith("save_stash", {
        repoPath: "/r",
        message: null,
        includeUntracked: true,
      });
    });

    it("normalizes an omitted tag message", () => {
      git.createTag("/r", "v1", "abc");
      expect(invoke).toHaveBeenCalledWith("create_tag", {
        repoPath: "/r",
        name: "v1",
        hash: "abc",
        message: null,
      });
    });
  });

  describe("renameBranch", () => {
    it("sends the Rust parameter names, which are reserved words in JS", () => {
      git.renameBranch("/r", "old-name", "new-name");
      expect(invoke).toHaveBeenCalledWith("rename_branch", {
        repoPath: "/r",
        old: "old-name",
        new: "new-name",
      });
    });
  });

  describe("defaults", () => {
    it("applies the shared log limit when none is given", () => {
      git.getLog("/r");
      expect(invoke).toHaveBeenCalledWith("get_git_log", {
        repoPath: "/r",
        limit: git.DEFAULT_LOG_LIMIT,
      });
    });

    it("includes untracked files when stashing by default", () => {
      git.saveStash("/r", "wip");
      expect(invoke.mock.calls[0][1].includeUntracked).toBe(true);
    });
  });

  describe("folder picker", () => {
    it("asks for a single directory", async () => {
      openDialog.mockResolvedValue("/chosen/path");

      await expect(git.pickRepositoryFolder()).resolves.toBe("/chosen/path");
      expect(openDialog).toHaveBeenCalledWith(
        expect.objectContaining({ directory: true, multiple: false })
      );
    });

    it("returns null when the dialog is cancelled", async () => {
      openDialog.mockResolvedValue(null);
      await expect(git.pickRepositoryFolder()).resolves.toBeNull();
    });

    it("returns null for a multi-selection result it cannot use", async () => {
      openDialog.mockResolvedValue(["/a", "/b"]);
      await expect(git.pickRepositoryFolder()).resolves.toBeNull();
    });
  });

  describe("event subscription", () => {
    it("listens on the same event name the Rust watcher emits", () => {
      const handler = vi.fn();
      git.onRepoChanged(handler);

      expect(listen).toHaveBeenCalledWith("repo-changed", handler);
      expect(git.REPO_CHANGED_EVENT).toBe("repo-changed");
    });

    it("listens on the same event name the Rust MCP event emitter emits", () => {
      const handler = vi.fn();
      git.onMcpEvent(handler);

      expect(listen).toHaveBeenCalledWith("mcp-event", handler);
      expect(git.MCP_EVENT).toBe("mcp-event");
    });
  });

  describe("mcp commands", () => {
    it("invokes get_mcp_status", () => {
      git.getMcpStatus();
      expect(invoke).toHaveBeenCalledWith("get_mcp_status");
    });

    it("invokes set_mcp_enabled", () => {
      git.setMcpEnabled(true);
      expect(invoke).toHaveBeenCalledWith("set_mcp_enabled", { enabled: true });
    });
  });

  describe("ai and stage hunk commands", () => {
    it("invokes save_ai_config", () => {
      git.saveAiConfig("anthropic", "claude-3-5-sonnet", "sk-123");
      expect(invoke).toHaveBeenCalledWith("save_ai_config", {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        apiKey: "sk-123",
      });
    });

    it("invokes get_ai_config", () => {
      git.getAiConfig();
      expect(invoke).toHaveBeenCalledWith("get_ai_config");
    });

    it("invokes test_ai_connection", () => {
      git.testAiConnection("openai", "gpt-4o", "sk-456");
      expect(invoke).toHaveBeenCalledWith("test_ai_connection", {
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-456",
      });
    });

    it("invokes ai_compose_commit_message", () => {
      git.aiComposeCommitMessage("/r");
      expect(invoke).toHaveBeenCalledWith("ai_compose_commit_message", { repoPath: "/r" });
    });

    it("invokes git_stage_hunk", () => {
      git.gitStageHunk("/r", "patch-content");
      expect(invoke).toHaveBeenCalledWith("git_stage_hunk", {
        repoPath: "/r",
        patch: "patch-content",
      });
    });
  });

  describe("github commands", () => {
    it("invokes save_github_token", () => {
      git.saveGithubToken("ghp_123");
      expect(invoke).toHaveBeenCalledWith("save_github_token", { token: "ghp_123" });
    });

    it("invokes get_github_token", () => {
      git.getGithubToken();
      expect(invoke).toHaveBeenCalledWith("get_github_token");
    });

    it("invokes delete_github_token", () => {
      git.deleteGithubToken();
      expect(invoke).toHaveBeenCalledWith("delete_github_token");
    });

    it("invokes test_github_token", () => {
      git.testGithubConnection("ghp_123");
      expect(invoke).toHaveBeenCalledWith("test_github_token", { token: "ghp_123" });
    });

    it("invokes get_repo_origin", () => {
      git.getRepoOrigin("/r");
      expect(invoke).toHaveBeenCalledWith("get_repo_origin", { repoPath: "/r" });
    });

    it("invokes github_search_prs", () => {
      git.githubSearchPrs("/r");
      expect(invoke).toHaveBeenCalledWith("github_search_prs", { repoPath: "/r" });
    });

    it("invokes github_get_launchpad_items", () => {
      git.githubGetLaunchpadItems("/r");
      expect(invoke).toHaveBeenCalledWith("github_get_launchpad_items", { repoPath: "/r" });
    });

    it("invokes github_get_pr", () => {
      git.githubGetPr("/r", 42);
      expect(invoke).toHaveBeenCalledWith("github_get_pr", { repoPath: "/r", number: 42 });
    });

    it("invokes github_create_pr", () => {
      git.githubCreatePr("/r", "Title", "Body", "feat", "main");
      expect(invoke).toHaveBeenCalledWith("github_create_pr", {
        repoPath: "/r",
        title: "Title",
        body: "Body",
        head: "feat",
        base: "main",
      });
    });

    it("invokes start_work_on_issue", () => {
      git.startWorkOnIssue("/r", 123, "Fix login");
      expect(invoke).toHaveBeenCalledWith("start_work_on_issue", {
        repoPath: "/r",
        number: 123,
        title: "Fix login",
      });
    });
  });
});
