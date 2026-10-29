# Slayply Coding & Engineering Standards

---

## 1. General Principles
- **Simplicity first:** The best code is code that is easy to delete and easy to reason about.
- **Explicit types over `any`:** `any` is forbidden across all packages. If a type is truly unknown, use `unknown` and narrow with type guards or Zod schemas.
- **Fail cleanly:** Never swallow errors silently or return half-baked states without warning signals.

---

## 2. Language & Framework Standards (TypeScript & Node/Browser)

### Formatting & Linting
- **Tool:** Biome (`@biomejs/biome`); the pinned version is in `package.json` and `docs/VERSIONS.md`. Biome formats and lints code and JSON only (Markdown and YAML are excluded).
- **Indentation:** 2 spaces, no tabs.
- **Line Endings:** LF everywhere (`.gitattributes` enforces this).
- **Quotes & Semicolons:** Double quotes, semicolons required.

### Naming Conventions
*Review-enforced: Biome's naming rules are not enabled, so reviewers check these.*
- **Files & Directories:** `kebab-case` (e.g. `claim-checker.ts`, `prompt-builder.test.ts`).
- **Classes, Types & Interfaces:** `PascalCase` (e.g. `GenerateRequest`, `ClaudeProvider`).
- **Variables, Functions & Properties:** `camelCase` (e.g. `validateResponse`, `factId`).
- **Module-level constants:** `UPPER_SNAKE_CASE` for primitive and lookup-table constants (e.g. `MAX_PAYLOAD_BYTES`, `LIMITS`). Zod schemas and inferred types follow the camelCase/PascalCase rules above (`generateRequestSchema`, `GenerateRequest`).

### Error Handling
- Use typed error classes or structured result objects for domain errors.
- Never catch an exception just to `console.log(err)` and continue. Either rethrow, wrap with contextual details, or return a formal error result.
- Relay HTTP errors must return structured JSON:
  ```json
  {
    "error": {
      "code": "BAD_REQUEST",
      "message": "Payload exceeds 500 KB limit",
      "details": []
    }
  }
  ```

### Logging Rules
- **Relay logs:** Strictly metadata only: `[timestamp] [status] [latency_ms] [provider] [model]`. Provider and model names are configuration, not user content.
- **Forbidden in logs:** Request bodies, response texts, user profile facts, prompts, or API key headers.

### Hot-Path Performance Rules
- Avoid redundant deep clones on large text payloads or parsed resumes.
- Regex expressions executed on input text must be compiled once at module load time to prevent catastrophic backtracking.
- Stream chunks incrementally rather than buffering full response strings in memory.

### Security Rules
- **Header scrubbing:** Ephemeral API keys passed to `apps/relay` must be read from headers into memory for the fetch call and not retained in global scope or cached objects.
- **CORS policy:** Origins strictly checked. Wildcard `*` is prohibited in production relay config.
- **DOM insertion:** Never use `dangerouslySetInnerHTML` or `innerHTML` with unsanitized LLM output. Render plain text or use sanitized AST renderers.

---

## 3. Testing Strategy & Standards

### Test Pyramid Layout
- `*.test.ts` placed adjacent to the file being tested (e.g. `schema.ts` and `schema.test.ts`).
- `fixtures/` folders containing anonymized, static JSON mocks and recorded SSE responses.

### Required Test Paths
Every new feature or provider adapter must include test coverage for:
1. **Happy Path:** Valid inputs produce expected outputs conforming to Zod schema.
2. **Sad Path:** Malformed inputs, missing headers, or unreachable upstream providers fail gracefully with clean error messages.
3. **Edge Cases:** Empty strings, boundary character limits (`maxChars`), special unicode characters, zero questions.
4. **Abuse / Malicious Path:** Prompt injection probes, oversized payloads (> 500 KB), invalid JSON payloads.

### Determinism
- Tests must never depend on live external networks or real API keys.
- Mock all network calls via recorded fixtures or in-memory handlers (`vi.fn()`, or `msw` if it is added with a `docs/VERSIONS.md` entry).

---

## 4. Git Conventions & Workflow

### Branch Naming
- Pattern: `<type>/<ID>-<slug>`
- Examples:
  - `feat/CORE-01-zod-schemas`
  - `fix/BP-001-relay-cors-header`
  - `chore/BOOT-01-scaffold-workspaces`
  - `docs/BP-002-readme` (`<type>` may be `docs`; the identifier is the roadmap or bug ID)

### Commit Messages (Conventional Commits)
Format: `<type>(<scope>): <short description>`
- `feat(relay): add SSE streaming endpoint`
- `fix(core): correct fact ID regex matcher`
- `test(providers): add Claude fixture tests`
- `chore(tooling): bump biome config`
- `docs(handbook): update runtime flow diagram`

### Pull Requests & Merging
- All PRs require a green `check` job (it runs doctor, handoff, format, lint, test and typecheck).
- PRs must update `docs/POINTER.md`.
- Squash merge only to keep `main` history linear and clean.
