# Security Policy

## Supported Versions

PenguinGit is pre-1.0 and in early development (see [ROADMAP.md](ROADMAP.md)). Only the latest commit on `main` is supported for security fixes at this stage.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities. Instead, use [GitHub's private vulnerability reporting](https://github.com/Ayush442842q/Penguin-Git/security/advisories/new) for this repository, or contact the maintainer directly.

Include as much detail as possible: affected version/commit, reproduction steps, and potential impact (e.g. arbitrary command execution, credential exposure, path traversal).

## Scope notes specific to PenguinGit's architecture

- PenguinGit shells out to the system `git` CLI rather than linking `libgit2`. Any issue where user- or repo-controlled input (branch names, file paths, remote URLs, commit messages) could be used to inject additional arguments or shell metacharacters into a `git` invocation is in scope and treated as high priority.
- Credentials (AI provider API keys, GitHub tokens, and — once built — self-hosted backend auth tokens) are stored via the OS keychain, never in plaintext. Any code path that logs, caches, or otherwise exposes these values outside the keychain is a valid finding.
- The self-hosted cloud backend (Phase 7 of the roadmap) is a separate, opt-in service; authorization issues there (e.g. a user accessing another user's workspace or patch) are in scope once that component exists.
