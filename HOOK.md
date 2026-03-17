---
name: advanced-bootstrap
description: "Configurable bootstrap content injection with per-agent filtering"
metadata: { "openclaw": { "emoji": "📚", "events": ["agent:bootstrap"] } }
---

# Advanced Bootstrap Hook

Injects shared prompt content into agent bootstrap with per-agent filtering.

## Features

- **Config-driven sources:** Multiple source paths with glob support
- **Template variables:** `{agentId}`, `{workspace}` in paths
- **Date templates:** `{date}`, `{yesterday}`, `{tomorrow}`, `{date-N}`, `{date+N}`, `{date:format}`
- **Per-agent filtering:** `include` / `exclude` arrays per source
- **Include syntax:** `{{include:path}}` in bootstrap files

## Configuration

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "advanced-bootstrap": {
          "enabled": true,
          "sources": [
            {
              "path": "~/.openclaw/shared/bootstrap/*.md",
              "mode": "prepend"
            },
            {
              "path": "~/.openclaw/shared/bootstrap/agents/{agentId}/*.md",
              "mode": "append"
            },
            {
              "path": "{workspace}/local-bootstrap/*.md",
              "mode": "append",
              "exclude": ["researcher", "life-coach"]
            }
          ]
        }
      }
    }
  }
}
```

## Source Options

| Option | Type | Description |
|--------|------|-------------|
| `path` | string | Glob pattern or file path (supports templates) |
| `mode` | string | `"prepend"` or `"append"` |
| `include` | string[] | Only these agents get this source |
| `exclude` | string[] | These agents skip this source |

## Template Variables

| Variable | Replaced With |
|----------|---------------|
| `{agentId}` | Current agent ID (e.g., `bot-engineer`) |
| `{workspace}` | Agent's workspace directory path |
| `{date}` or `{today}` | Current date in yyyy-MM-dd |
| `{yesterday}` | Yesterday's date |
| `{tomorrow}` | Tomorrow's date |
| `{date-N}` | N days ago (e.g., `{date-7}` = week ago) |
| `{date+N}` | N days from now |
| `{date:format}` | Custom format |

**Date Format Specifiers:**
- `YYYY` → Full year (2026)
- `MM` → Month with leading zero (01-12)
- `DD` → Day with leading zero (01-31)

**Examples:**
```json
{ "path": "{workspace}/memory/{date}.md" }
// → /path/to/workspace/memory/2026-03-18.md

{ "path": "~/.openclaw/logs/{yesterday}.log" }
// → ~/.openclaw/logs/2026-03-17.log

{ "path": "{workspace}/logs/{date:YYYY/MM}/log.md" }
// → /path/to/workspace/logs/2026/03/log.md
```

**Include syntax with dates:**
```markdown
{{include:memory/{date}.md}}
{{include:logs/{yesterday}.md}}
```

## Filter Rules

- `exclude` takes precedence over `include`
- If neither specified, all agents get the source
- Agent ID extracted from session key (`agent:<agentId>:...`)

## Include Syntax

In any bootstrap file:

```markdown
{{include:bootstrap/tools.md}}

# Local rules...
```

## Directory Structure

```
~/.openclaw/shared/bootstrap/
├── session-startup.md     # All agents
├── tools.md               # All agents
└── agents/
    ├── bot-engineer/
    │   └── debugging.md   # bot-engineer only
    └── writer/
        └── creative.md    # writer only
```

## Logging

On bootstrap, the hook logs all loaded files:

```
[advanced-bootstrap] Loaded 3 files for agent "main":
  ↑ ~/.openclaw/shared/bootstrap/10-core-values.md
  ↑ ~/.openclaw/shared/bootstrap/80-tools.md
  ↓ {workspace}/memory/2026-03-18.md
```

- `↑` = prepended
- `↓` = appended