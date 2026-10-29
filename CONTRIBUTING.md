# Contributing to Slayply

Thanks for helping. Slayply is a small, privacy-first project, so a few rules keep it that way.

## Ground rules

- **No automation of job sites.** Nothing that auto-fills, auto-submits, navigates or scrapes in the background. See [`docs/SPEC.md`](docs/SPEC.md) §1 and §9.
- **No telemetry, accounts or server-side storage.** The relay stays stateless.
- **Every claim is grounded.** Generated text cites fact IDs; do not weaken the claim checker.
- **The spec is changed only by an approved proposal.** Open an issue describing what it replaces, the cost and the risk.

## Setup

```bash
git clone https://github.com/devnadeemashraf/slayply.git
cd slayply
pnpm install        # installs git hooks too
pnpm run doctor     # toolchain must match the pins
pnpm run check      # must be green before you push
```

Requirements and details: [`docs/SETUP.md`](docs/SETUP.md).

## How work flows

1. Pick an item from [`docs/ROADMAP.md`](docs/ROADMAP.md) (or a bug in the fix-first queue of [`docs/POINTER.md`](docs/POINTER.md)). Comment on it first if it is not yours.
2. Branch from an up-to-date `main` as `<type>/<ID>-<slug>`, for example `feat/CORE-02-relay`.
3. Write tests first: happy, sad, edge and abuse paths. Tests never depend on the network or real API keys.
4. Make the smallest change that passes. Follow [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md).
5. Run `pnpm run check`. Do not weaken or skip a test to get green.
6. Update `docs/POINTER.md`, the roadmap status, and `docs/HANDBOOK.md` when you add a module. CI enforces this.
7. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat(core): add fit-check schema`) and open a PR using the template. One roadmap item per PR; PRs are squash-merged.

## Style

Biome formats and lints (`pnpm run fmt`, `pnpm run lint`). TypeScript is strict and `any` is forbidden. Never log request bodies, prompts, profile data or keys.

## Reporting problems

- Bugs and ideas: open an issue.
- Security issues: see [`SECURITY.md`](SECURITY.md). Do not file them publicly.

## License

By contributing you agree your work is released under the [MIT License](LICENSE).
