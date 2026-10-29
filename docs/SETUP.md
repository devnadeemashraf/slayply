# Slayply Setup Guide

Step-by-step developer setup for running Slayply locally and configuring repository protection. Commands are shown for PowerShell; every `pnpm` and `git` command is identical in bash or zsh on macOS and Linux.

---

## 1. Prerequisites

Verify installed tools match the pinned versions in `docs/VERSIONS.md`:
- **Node.js:** v24.x LTS (Recommended: v24.21.0+)
- **pnpm:** v12.x (Recommended: v12.6.0+)
- **Git:** v2.50+
- **Google Chrome:** v114+ (for Side Panel API support)

Verify in PowerShell:
```powershell
node --version
pnpm --version
git --version
```

---

## 2. Clone & Install Dependencies

```powershell
# Clone the repository
git clone https://github.com/devnadeemashraf/slayply.git
cd slayply

# Install all workspace dependencies
pnpm install

# Run the environment doctor to verify all pins and tools
pnpm run doctor
```

---

## 3. Git Hooks Setup

`pnpm install` runs `scripts/setup-hooks.mjs` (the `prepare` script), which sets `core.hooksPath` to `.githooks`. To do it manually:
```powershell
git config core.hooksPath .githooks
```

Verify that hooks have execution permissions:
- `.githooks/pre-commit`: rejects unformatted staged files (fix with `pnpm run fmt`).
- `.githooks/commit-msg`: validates Conventional Commit format.
- `.githooks/pre-push`: guards against direct pushes to `main`.

---

## 4. GitHub Repository & Branch Protection Setup

For GitHub Free on a **public** repository (classic branch protection is not available to private repositories on the Free plan; check GitHub's plan comparison if you fork privately):
1. **Default Branch:** Set default branch to `main`.
2. **Branch Protection Rule for `main`:**
   - Go to **Settings** > **Branches** > **Add classic branch protection rule**.
   - Branch pattern: `main`
   - Check **Require a pull request before merging** (Require approvals: 0, since a solo maintainer cannot approve their own PR; raise this when there are other maintainers).
   - Check **Require status checks to pass before merging**:
     - `check` (the single CI job: doctor, handoff, format, lint, test, typecheck)
   - Check **Require linear history** (enforces squash or rebase merge).
   - Check **Do not allow bypassing the above settings**.
3. **Merge method:** under **Settings** > **General** > **Pull Requests**, allow only **Squash merging** so history stays linear (CODING_STANDARDS §4).
4. **Private vulnerability reporting:** under **Settings** > **Code security**, enable it so `SECURITY.md` works.

---

## 5. Environment Secrets & Configuration

Slayply follows a strict zero-server-secrets architecture:
- No shared database credentials or cloud secret managers are required for local development.
- The relay will read `PORT` and `NODE_ENV` from the environment (planned, `CORE-02`, which also adds `apps/relay/.env.example`).
- **User API Keys:** Stored exclusively in your browser's `chrome.storage.local` during local testing.

---

## 6. Running Local Development

### Run Relay Server (planned, `CORE-02`)
```powershell
pnpm --filter @slayply/relay dev
# Once CORE-02 lands, the relay starts at http://localhost:3000
# Test health: curl http://localhost:3000/health
```

### Run Extension in Development Mode (planned, `EXT-01`)
```powershell
pnpm --filter @slayply/extension dev
# WXT builds and launches an isolated Chrome instance with side panel mounted
```

### Run Full Verification Suite
```powershell
pnpm run check
```
