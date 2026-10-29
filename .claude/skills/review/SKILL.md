---
name: review
description: Self-review the current branch against docs/CODING_STANDARDS.md
disable-model-invocation: true
---

Delegate to the `reviewer` subagent for a review of `git diff origin/main...HEAD`. Then fix every finding it marks blocking, and list anything you chose not to fix with a reason.
