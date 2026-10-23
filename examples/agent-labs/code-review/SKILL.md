---
name: code-review
description: Review a diff or pull request and report severity-ranked findings. Use when asked to review code, a PR or a patch.
---

# Code review

## Instructions

1. Read the whole diff first, then the surrounding code for every changed function.
2. Check, in this order, and stop to verify before reporting:
   - **Correctness** — wrong conditions, off-by-one, null/undefined paths, error handling, race conditions.
   - **Security** — injection, missing authz checks, secrets in code, unsafe deserialisation, SSRF, path traversal.
   - **Data** — migrations that lock or lose data, missing indexes on new queries.
   - **Tests** — does a test fail without the change? Edge cases covered?
   - **Performance** — N+1 queries, unbounded loops or payloads.
   - **Readability** — only when it hides a bug or will clearly cause one.
3. For every finding give: file:line, what happens (a concrete input → wrong result), and a suggested fix.
4. Rank: 🔴 must fix, 🟠 should fix, 🟡 consider. Drop anything you could not substantiate.
5. Finish with a one-line verdict: approve, approve with nits, or request changes.

## Template

```markdown
### 🔴 SQL built from user input — `api/search.py:42`
`q` is interpolated into the query, so `q="x' OR 1=1 --"` returns every row.
**Fix:** use a bound parameter.
```
