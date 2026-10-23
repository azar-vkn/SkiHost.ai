---
name: web-research
description: Research a question on the web and answer with verified, cited sources. Use for fact-finding, market scans and literature reviews.
version: 1.4.0
license: Apache-2.0
---

# Web research with citations

## When to use

The user asks a question whose answer depends on current or external information, or asks you to "look into" a topic.

## Instructions

1. Restate the question and list 3–6 sub-questions that together answer it.
2. For each sub-question, search with 2–3 differently worded queries. Prefer primary sources (official docs, papers, filings, the organisation's own site) over aggregators.
3. Open and read the sources; do not rely on search snippets. Record for each claim: the quote, URL, publisher and date.
4. Cross-check: every important number or claim needs two independent sources, or must be marked as single-source.
5. Note disagreements between sources explicitly instead of picking one silently.
6. Write the answer:
   - Lead with a 2–3 sentence direct answer.
   - Then findings grouped by sub-question, each with inline citations `[1]`.
   - End with a numbered source list and a "confidence and gaps" note.
7. Never invent URLs or quotes. If you could not verify something, say so.

## Output template

```markdown
**Answer:** …

### Findings
- … [1][2]

### Sources
1. Title — Publisher, date. URL

### Confidence and gaps
…
```
