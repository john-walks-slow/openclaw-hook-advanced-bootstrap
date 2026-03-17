# OpenClaw Hook: Advanced Bootstrap

Configurable bootstrap content injection with per-agent filtering.

## Features

- **Config-driven sources:** Multiple source paths with glob support
- **Template variables:** `{agentId}`, `{workspace}`, `{date}`, `{yesterday}`, etc.
- **Per-agent filtering:** `include` / `exclude` arrays per source
- **Include syntax:** `{{include:path}}` in bootstrap files

## Install

```bash
npm install openclaw-hook-advanced-bootstrap
```

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
            }
          ]
        }
      }
    }
  }
}
```

See [HOOK.md](./HOOK.md) for full documentation.

## License

MIT