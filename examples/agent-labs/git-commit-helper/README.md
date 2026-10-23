# git-commit-helper

Two Claude Code slash commands:

| Command | Does |
| --- | --- |
| `/commit` | Reads the staged diff, writes a Conventional Commit message, commits |
| `/changelog` | Drafts user-facing release notes from commits since the last tag |

## Install

```bash
skihost install agent-labs/git-commit-helper --claude
cp .claude/plugins/git-commit-helper/commands/*.md .claude/commands/
```

The first command unpacks the plugin into `.claude/plugins/git-commit-helper`; the second enables its commands in this project.
