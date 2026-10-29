---
name: check
description: Run the full repository check
disable-model-invocation: true
allowed-tools: Bash(pnpm run check)
---

Run `pnpm run check` and report the first failing stage with its output. If it passes, say so plainly.
