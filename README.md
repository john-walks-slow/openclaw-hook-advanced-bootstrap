# OpenClaw Hook: Advanced Bootstrap

Configurable bootstrap content injection with per-agent filtering.

## What It Does

Loads shared prompt files into agent bootstrap context. Supports:

- Multiple sources with glob patterns
- Per-agent filtering (include/exclude)
- Agent-local configuration via `requires.yaml`
- Date template variables
- Inline prompts

## Install

```bash
npm install @johnnren/openclaw-hook-advanced-bootstrap
```

## Basic Usage

**Global config** (`openclaw.json`):

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "advanced-bootstrap": {
          "enabled": true,
          "sources": [
            { "path": "~/.openclaw/shared/bootstrap/*.md", "mode": "prepend" },
            { "path": "{workspace}/memory/{date}.md", "mode": "append" }
          ]
        }
      }
    }
  }
}
```

**Agent-local config** (`workspace-agents/main/requires.yaml`):

```yaml
ignore_defaults: false

include:
  - path: skills/research/SKILL.md
    mode: prepend

exclude:
  - "shared/bootstrap/80-*.md"

prompts:
  - text: |
      你是一个专注的研究助手。
      保持简洁，直接回答。
    mode: prepend
```

## Features

| Feature | Description |
|---------|-------------|
| `sources` | Global file paths/globs to load |
| `requires.yaml` | Per-agent include/exclude/prompts |
| `ignore_defaults` | Skip global sources entirely |
| `include` / `exclude` | Filter what gets loaded |
| `prompts` | Inline text, no file needed |
| Date templates | `{date}`, `{yesterday}`, `{date-7}`, etc. |

## Documentation

See [HOOK.md](./HOOK.md) for full configuration reference.

## License

MIT