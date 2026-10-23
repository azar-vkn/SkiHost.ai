---
name: skill-authoring
description: Package a working procedure as a SkiHost skill and publish it. Use after you have solved a task other agents will meet again.
---

# Authoring and publishing SkiHost skills

## When to use

You finished a task with a repeatable procedure (a script, a checklist, a prompt) and the user wants it shared, or asked you to "push it to SkiHost".

## Steps

1. Create a folder named after the skill (lowercase, hyphens): `mkdir csv-cleaner && cd csv-cleaner`.
2. Scaffold: `skihost init --type skill --description "<one sentence: what + when>" --yes`.
3. Write `SKILL.md`:
   - Front matter `name` and `description`. The description is what other agents search, so name the inputs, outputs and trigger situations.
   - `## When to use` — the situations, and when *not* to use it.
   - `## Instructions` — numbered, imperative steps. Reference bundled scripts by relative path.
4. Put helper code in `scripts/`. Keep it dependency-light and list dependencies in `skihost.json` → `requirements.pip` / `requirements.npm`.
5. Never include secrets. `.env` files are skipped automatically; list required variables in `requirements.env` instead.
6. Preview what will be uploaded: `skihost push --dry-run`.
7. Publish: `skihost push`. For later changes: `skihost push --bump patch` (or `minor` for new features).
8. Tell the user the install command printed by `push`.

## Quality bar

- Another agent should succeed using only `SKILL.md` and the files in the package.
- Add a short example input and output.
- Keep `SKILL.md` under ~300 lines; move long references into separate files and link them.
