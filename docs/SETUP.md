# Slayply Setup Guide (Windows & Cross-Platform)

Step-by-step developer setup for running Slayply locally on Windows (PowerShell) and configuring repository protection.

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
git clone https://github.com/<your-org>/slayply.git
cd slayply

# Install all workspace dependencies
pnpm install

# Run the environment doctor to verify all pins and tools
pnpm run doctor
```

---

## 3. Git Hooks Setup

Ensure git hooks are enabled so pre-commit and commit-msg checks run automatically:
```powershell
git config core.hooksPath .githooks
```

Verify that hooks have execution permissions:
- `.githooks/pre-commit`: runs format and lint checks.
- `.githooks/commit-msg`: validates Conventional Commit format.
- `.githooks/pre-push`: guards against direct pushes to `main`.

---

## 4. GitHub Repository & Branch Protection Setup

For GitHub Free (Public / Private):
1. **Default Branch:** Set default branch to `main`.
2. **Branch Protection Rule for `main`:**
   - Go to **Settings** > **Branches** > **Add classic branch protection rule**.
   - Branch pattern: `main`
   - Check **Require a pull request before merging** (Require approvals: 1).
   - Check **Require status checks to pass before merging**:
     - `ci/test`
     - `ci/lint`
     - `ci/handoff-check`
   - Check **Require linear history** (enforces squash or rebase merge).
   - Check **Do not allow bypassing the above settings**.

---

## 5. Environment Secrets & Configuration

Slayply follows a strict zero-server-secrets architecture:
- No shared database credentials or cloud secret managers are required for local development.
- Copy `.env.example` in `apps/relay` when testing provider integrations:
  ```powershell
  # apps/relay/.env (optional local overrides)
  PORT=3000
  NODE_ENV=development
  ```
- **User API Keys:** Stored exclusively in your browser's `chrome.storage.local` during local testing.

---

## 6. Running Local Development

### Run Relay Server
```powershell
pnpm --filter relay dev
# Relay starts at http://localhost:3000
# Test health: curl http://localhost:3000/health
```

### Run Extension in Development Mode
```powershell
pnpm --filter extension dev
# WXT builds and launches an isolated Chrome instance with side panel mounted
```

### Run Full Verification Suite
```powershell
pnpm run check
```
