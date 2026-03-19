---
name: advanced-bootstrap
description: "Configurable bootstrap content injection with per-agent filtering"
metadata: { "openclaw": { "emoji": "📚", "events": ["agent:bootstrap"] } }
---

# Advanced Bootstrap Hook

Injects shared prompt content into agent bootstrap with per-agent filtering.

## Configuration

### Global Sources (`openclaw.json`)

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
            }
          ]
        }
      }
    }
  }
}
```

**Source options:**
- `path`: File path or glob pattern (supports templates)
- `mode`: `"prepend"` or `"append"`
- `include`: Only these agents get this source
- `exclude`: These agents skip this source

### Agent-Local Config (`requires.yaml`)

Place in agent workspace directory:

```yaml
# requires.yaml

# Skip all global sources (default: false)
ignore_defaults: false

# Include additional files
include:
  - path: memory/{date}.md
    mode: append
  - path: skills/research/SKILL.md
    mode: prepend

# Exclude from global sources
exclude:
  - "shared/bootstrap/80-*.md"

# Inline prompts (no file needed)
prompts:
  - text: |
      You are a focused research assistant.
      Keep responses concise.
    mode: prepend
```

## Template Variables

Paths support dynamic variables:

| Variable | Example |
|----------|---------|
| `{agentId}` | `coder`, `researcher` |
| `{workspace}` | `/path/to/workspace` |
| `{date}` | `2026-03-19` |
| `{yesterday}` | `2026-03-18` |
| `{tomorrow}` | `2026-03-20` |
| `{date-N}` | `{date-7}` = week ago |
| `{date+N}` | `{date+1}` = tomorrow |
| `{date:format}` | `{date:YYYY/MM}` = `2026/03` |

## Include Syntax

Inside bootstrap files, include other files:

```markdown
{{include:bootstrap/tools.md}}
{{include:memory/{date}.md}}
```

## Filtering Rules

1. Agent-local `exclude` filters global sources
2. Global source `exclude`/`include` controls which agents receive it
3. `exclude` takes precedence over `include`

## Loading Order

Files load in filename order (sorted alphabetically). Log output:

```
[advanced-bootstrap] Loaded 5 items for agent "main":
  ↑ ~/.openclaw/shared/bootstrap/00-context.md (global)
  ↑ ~/.openclaw/shared/bootstrap/10-core-values.md (global)
  ↑ [inline prompt]
  ↓ ~/.openclaw/workspace-agents/main/memory/2026-03-19.md (local)
```

- `↑` = prepended
- `↓` = appended
- `(global)` / `(local)` = source type

## Common Patterns

### Shared Base + Agent-Specific

```json
{
  "sources": [
    { "path": "~/.openclaw/shared/bootstrap/*.md", "mode": "prepend" },
    { "path": "~/.openclaw/shared/bootstrap/agents/{agentId}/*.md", "mode": "append" }
  ]
}
```

### Minimal Agent (No Global)

```yaml
# workspace-agents/worker/requires.yaml
ignore_defaults: true
prompts:
  - text: You are a worker agent. Complete tasks efficiently.
```

### Daily Memory

```yaml
include:
  - path: memory/{date}.md
    mode: append
```

## License

MIT