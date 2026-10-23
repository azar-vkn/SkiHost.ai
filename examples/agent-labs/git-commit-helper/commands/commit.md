---
description: Write a Conventional Commit message for the staged changes and commit
---

1. Run `git diff --cached --stat` and `git diff --cached`. If nothing is staged, say so and stop.
2. Pick the type: feat, fix, docs, refactor, perf, test, build, ci or chore. Add a scope when one directory or module dominates.
3. Write a subject line under 72 characters in the imperative mood ("add", not "added"), no trailing period.
4. Add a body only when the *why* is not obvious from the diff. Wrap at 72 columns.
5. Mark breaking changes with `!` after the type and a `BREAKING CHANGE:` footer.
6. Show the message, then run `git commit -F -` with it.
