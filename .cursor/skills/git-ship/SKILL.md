---
name: git-ship
description: >-
  End-to-end git shipping for Chex4ever/go2rtc: branch from master, commit all
  completed work, push, open PR, self-review checklist, fix CI via babysit loop,
  merge to master. Use when the user says git-ship, ship it, commit and PR,
  merge the PR, or when a feature task is finished and should land on GitHub.
---

# git-ship

Ship completed work to **master** on `Chex4ever/go2rtc` without leaving dirty trees or unmerged branches.

**When this skill applies**, commit and open PRs as part of finishing the task (overrides “commit only when asked” for that task).

## Repo defaults

| Item | Value |
|------|--------|
| Default branch | `master` |
| Remote | `origin` → `https://github.com/Chex4ever/go2rtc.git` |
| Branch prefix | `feat/<short-slug>` (fix: `fix/…`, docs: `docs/…`) |
| PR base | `master` |
| GitHub CLI | `gh` (must be authenticated) |

## Hard rules

- **Never** `git push --force` to `master` / `main`.
- **Never** `git config` changes, `reset --hard`, or history rewrite without explicit user approval.
- **Never** commit secrets (`.env`, keys, passwords) or build artifacts:
  - `*.exe`, `desktop/**/build-*`, `desktop/releases/`, `go2rtc-updater.exe`, `node_modules/`
- **Never** `git add .` / `git add -A` — stage only files for this change.
- **Never** merge if required CI is **red** (fix or report blocker).
- On **PowerShell**, chain commands with `;` not `&&`.

## Self-review (required before merge)

You are the reviewer. Before merge, explicitly confirm:

1. **Scope** — Diff matches the stated feature; no drive-by refactors.
2. **Tests** — Run and pass (when touched areas have tests):
   - `go test ./internal/release/... ./internal/viewer/... ./internal/updater/... -count=1`
   - `node --test desktop/electron-viewer/test/*.test.js`
3. **Invariants** — Viewer morning-start unchanged unless intentional (`morning-start.test.js`, `layout-auto.test.js`).
4. **Security** — No credentials in diff.
5. **CI** — PR checks green (use **babysit** workflow if not).

Post a short self-review on the PR (comment or PR body section):

```markdown
## Self-review
- [x] Scope matches feature
- [x] Tests run locally
- [x] CI green
- Notes: …
```

Merge only after all boxes are checked.

## Workflow

### 1. Preflight

```powershell
cd <repo-root>
git fetch origin
git status
```

- If on `master` with changes → create branch (step 2).
- If already on `feat/…` with unrelated WIP → ask user or stash; do not mix features.
- If branch is behind `origin/master` → merge or rebase `origin/master` before PR.

### 2. Branch (if needed)

```powershell
git checkout master
git pull origin master
git checkout -b feat/<short-slug>
```

Slug: lowercase, hyphens, max ~40 chars (e.g. `feat/updater-settings-ui`).

### 3. Commit

Parallel:

```powershell
git status
git diff
git log -3 --oneline
```

- Stage only relevant paths.
- Message: 1–2 sentences, **why** not just what (repo style: `Add …`, `Fix …`).
- PowerShell commit:

```powershell
git commit -m "Title line`n`nOptional body."
```

If nothing to commit, skip to step 5 (PR may already exist).

### 4. Push

```powershell
git push -u origin HEAD
```

If push rejected (large files): remove binaries from index, fix `.gitignore`, recommit — do not force-push.

### 5. Pull request

Check existing PR:

```powershell
gh pr list --head (git branch --show-current) --repo Chex4ever/go2rtc
```

Create if missing (body via temp file on PowerShell):

```powershell
@'
## Summary
- …

## Test plan
- [ ] …

## Self-review
- [ ] Scope
- [ ] Tests
- [ ] CI
'@ | Out-File -Encoding utf8 .tmp-pr-body.md
gh pr create --repo Chex4ever/go2rtc --base master --head <branch> --title "<title>" --body-file .tmp-pr-body.md
Remove-Item .tmp-pr-body.md
```

Return the PR URL to the user.

### 6. CI and babysit

- Watch: `gh pr checks <n> --repo Chex4ever/go2rtc --watch`
- On failure: follow **babysit** skill — fix scoped issues, push, re-watch until green.
- Do not weaken CI or merge with red checks.

### 7. Merge (self-approved)

After self-review checklist is satisfied and CI is green:

```powershell
gh pr merge <n> --repo Chex4ever/go2rtc --merge --delete-branch
```

Optional: sync local master

```powershell
git checkout master
git pull origin master
```

Report: PR URL, merge commit, tag/release note if user asked for a release (`git tag v*`, `git push origin v*` → Release workflow).

## Releases (optional add-on)

Only when user wants a public release:

```powershell
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

CI [`.github/workflows/release.yml`](../../.github/workflows/release.yml) publishes GitHub Release assets. Bump `desktop/electron-viewer/package.json` version first if shipping desktop.

## Quick triggers

| User says | Action |
|-----------|--------|
| **git-ship** / **ship it** | Full workflow 1–7 |
| **commit and PR** | Steps 3–5 |
| **merge the PR** | Self-review + step 7 |
| **babysit** | Step 6 only (see babysit skill) |

## Examples

**Feature done on master:**

```
git checkout -b feat/config-updater-ui
git add www/config.html www/settings-app.js
git commit -m "Add Install updater service to settings UI"
git push -u origin HEAD
gh pr create …
gh pr checks --watch
# self-review comment
gh pr merge 2 --merge --delete-branch
```

**Already on feature branch, CI failed:**

```
# fix CI (e.g. npm install in workflow)
git add .github/workflows/viewer-desktop-test.yml
git commit -m "Fix CI: install test deps before npm test"
git push
gh pr checks --watch
```
