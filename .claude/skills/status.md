---
name: status
description: Quick project status snapshot for CheckFlow. Run at the start of any session, after finishing a task, or whenever you need to re-orient. Trigger when the user says "what did we do?", "where are we?", "give me a status", or starts a new session and needs context fast.
---

# Project Status Snapshot

When invoked, silently execute these two commands:

```bash
git status -s
git log -n 5 --oneline
```

Then produce a summary of **at most 3 lines**:

```
Recently finished: [inferred from git log — what the last commits completed]
In progress now:   [inferred from git status -s — which files are modified/staged]
Next logical step: [one-sentence inference, only if obvious from context]
```

## Rules
- Keep it telegraphic — no explanations, no extra headers
- If `git status -s` is clean (nothing modified), say "nothing in progress"
- If the last commits are ambiguous, describe what area they touched (e.g. "DB migrations for checklist versioning")
- Goal: full orientation in under 5 seconds

**This skill is live.** No evolution needed — it always reads the current git state.
