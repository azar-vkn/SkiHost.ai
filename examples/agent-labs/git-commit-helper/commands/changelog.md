---
description: Draft release notes from commits since the last tag
---

1. Find the last tag with `git describe --tags --abbrev=0` (if none, use the first commit).
2. List commits since then: `git log <tag>..HEAD --pretty=format:'%s (%h)'`.
3. Group them under **Features**, **Fixes**, **Performance**, **Other**, using the Conventional Commit type. Put breaking changes first under **Breaking changes**.
4. Rewrite each line for users, not developers; drop chore/ci commits unless they matter to users.
5. Output Markdown ready to paste into a GitHub release.
