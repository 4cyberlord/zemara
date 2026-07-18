# Videorc Changelog — source of truth

One file per release. This directory is the **single source** for the public
changelog: it compiles to `changelog.json` (via `pnpm changelog:build`), which
is uploaded to R2 next to the update feed and consumed by videorc-web
(`/changelog`, `/releases/<version>`), the newsletter render, and the desktop
"What's new" panel.

Everything here is **public by design**. Never include commit hashes, internal
gate/script names, acceptance checklists, or anything else that can't be on the
website — that material belongs in `docs/releases/<version>.md`, the internal
engineering record.

## File format

Filename is the full releaseId: `0.9.2-beta.1.md` (matches the R2 release path
and the update feed — never the bare `0.9.2`).

```markdown
---
version: 0.9.2-beta.1
date: 2026-07-01
channel: beta
title: Camera and microphone fixed in the installed app
summary: One sentence used by the changelog index, newsletter subject, and in-app banner.
highlights:
  - 2-5 short user-facing bullets.
  - This is the cut shown in-app and in the newsletter.
---

User-facing markdown body. Plain product voice — what changed and why you
care. Screenshots via public URLs only.
```

Frontmatter is a strict subset of YAML: scalar `key: value` lines plus the
`highlights:` block list. Unknown keys, malformed dates/versions, empty
highlights, or an empty body **fail validation** (`pnpm changelog:check`), and
from the release gate onward a release cannot ship without a valid entry for
its releaseId.

## Voice rules

- Write for users, not engineers: lead with what they can now do (or what
  stopped being broken), not how it was implemented.
- `summary` must stand alone — it is the only text some surfaces show.
- `highlights` are scannable fragments, one change each, no trailing filler.
- Link to `videorc.com` pages when pointing anywhere; never to the repo.
