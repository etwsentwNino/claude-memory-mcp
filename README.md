<div align="center">

<br />

```
  _   _                        ____ _                 _        __  __
 | \ | (_)_ __   ___ ( )___   / ___| | __ _ _   _  __| | ___  |  \/  | ___ _ __ ___   ___  _ __ _   _
 |  \| | | '_ \ / _ \|// __| | |   | |/ _` | | | |/ _` |/ _ \ | |\/| |/ _ \ '_ ` _ \ / _ \| '__| | | |
 | |\  | | | | | (_) | \__ \ | |___| | (_| | |_| | (_| |  __/ | |  | |  __/ | | | | | (_) | |  | |_| |
 |_| \_|_|_| |_|\___/  |___/  \____|_|\__,_|\__,_|\__,_|\___| |_|  |_|\___|_| |_| |_|\___/|_|   \__, |
                                                                                                   |_/
```

**Claude never forgets where you left off.**

Persistent project memory for [Claude Code](https://claude.ai/code) via the Model Context Protocol.

<br />

[![MCP](https://img.shields.io/badge/MCP-Compatible-4A90D9?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/v0.4.0-stable-2ECC71?style=for-the-badge)](https://github.com/ninodinoo/ninos-claude-memory-mcp/releases)
[![License](https://img.shields.io/badge/MIT-yellow?style=for-the-badge&label=license)](LICENSE)
[![Node](https://img.shields.io/badge/18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white&label=node)](https://nodejs.org)

<br />

[Problem](#the-problem) &nbsp;&bull;&nbsp; [How It Works](#how-it-works) &nbsp;&bull;&nbsp; [Installation](#installation) &nbsp;&bull;&nbsp; [Tools](#tools) &nbsp;&bull;&nbsp; [Usage](#usage) &nbsp;&bull;&nbsp; [License](#license)

<br />

</div>

---

<br />

## The Problem

Claude Code has no memory between sessions. Every conversation starts from zero.

You spend an hour making architectural decisions, fixing bugs, establishing patterns — then close the terminal. Next session, all of that context is gone. You waste the first 10 minutes re-explaining what you already discussed yesterday.

This is **context rot**. It compounds over time, and it gets worse the larger your project becomes.

<br />

## How It Works

This MCP server creates a `.claude-memory/` folder inside your project. Two focused tools let Claude persist and retrieve knowledge across sessions. A startup hook automatically loads the current work state — zero manual intervention.

```
your-project/
├── src/
├── package.json
├── .claude-memory/                  # Created automatically on first use
│   ├── index.json                   # Topic registry
│   ├── architecture.md              # System design knowledge
│   ├── decisions.md                 # Why choices were made
│   ├── current-task.md              # Active work state (auto-loaded on session start)
│   └── entities/                    # Nested topics via slash notation
│       └── auth.md
└── ...
```

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   SESSION START              DURING WORK                SESSION END     │
│                                                                         │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │   Hook   │    │  Claude  │    │  check-  │    │  check-  │         │
│   │  auto-   │───▶│  works   │───▶│  point   │───▶│  point   │         │
│   │  loads   │    │  with    │    │  saves   │    │  final   │         │
│   │ context  │    │ context  │    │  state   │    │  state   │         │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│        │                                               │                │
│   Reads from                                     Writes to              │
│   .claude-memory/                                .claude-memory/        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

<br />

## Installation

### Quick setup (recommended)

```bash
claude mcp add ninos-claude-memory -s user -- npx -y ninos-claude-memory-mcp
```

Claude Code downloads, builds, and connects automatically.

Verify:

```bash
claude mcp list
# Should show: ninos-claude-memory: connected
```

### From source

```bash
git clone https://github.com/ninodinoo/ninos-claude-memory-mcp.git
cd ninos-claude-memory-mcp
npm install && npm run build
```

Then register:

```bash
claude mcp add ninos-claude-memory -s user -- node /absolute/path/to/dist/index.js
```

### Register the SessionStart Hook

Add to your global `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "node /absolute/path/to/dist/hooks/session-start.js",
        "timeout": 5000
      }
    ]
  }
}
```

This auto-loads `current-task` and the topic list on every prompt — no manual loading needed.

<br />

## Tools

Two tools. That's it.

### `memory`

One tool for all memory operations. Behavior depends on what you pass:

| Call | What happens |
|------|-------------|
| `memory()` | List all topics with size and last update |
| `memory(topic: "architecture")` | Read a specific entry |
| `memory(topic: "decisions", content: "...", mode: "write")` | Write / overwrite |
| `memory(topic: "decisions", content: "...", mode: "append")` | Append to existing |
| `memory(topic: "old-stuff", mode: "delete")` | Delete an entry |

Auto-initializes `.claude-memory/` with `architecture`, `decisions`, and `current-task` on first write.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `topic` | `string` | `""` | Topic path. Empty = list all |
| `content` | `string` | `""` | Markdown content. Empty = read |
| `mode` | `write \| append \| delete` | `write` | Write mode |
| `tags` | `string[]` | `[]` | Optional tags |

### `checkpoint`

Save current work state. Overwrites `current-task` — last state wins, no bloat.

```
checkpoint(
  summary: "Auth module done with JWT + refresh tokens",
  nextSteps: ["Add rate limiting", "Write integration tests"]
)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `summary` | `string` | Yes | What was accomplished |
| `nextSteps` | `string[]` | No | Planned next actions |
| `blockers` | `string[]` | No | Open questions or blockers |

<br />

## Usage

Add this to your project's `CLAUDE.md`:

```markdown
## Memory

- Session start automatically loads current work state via hook
- After significant changes: call `checkpoint`
- Save decisions: `memory("decisions", "new decision here...", "append")`
- Delete obsolete entries: `memory("old-topic", "", "delete")`
```

### Topics

Topics map to Markdown files. Slashes create subdirectories:

| Topic | File |
|-------|------|
| `architecture` | `.claude-memory/architecture.md` |
| `decisions` | `.claude-memory/decisions.md` |
| `current-task` | `.claude-memory/current-task.md` |
| `entities/auth` | `.claude-memory/entities/auth.md` |

### Data Format

Every entry is plain Markdown with a metadata header:

```markdown
<!-- META:{"created":"2026-01-01T10:00:00Z","updated":"2026-01-15T14:30:00Z","accessCount":5,"tags":["core"]} -->

# Authentication Architecture

JWT-based auth with refresh token rotation...
```

Files are human-readable, editable, and committable. Add `.claude-memory/` to `.gitignore` to keep it personal, or commit it to share context with your team.

<br />

## Security

- **Path traversal protection** — Topics with `../` are blocked and auto-cleaned from the index
- **100% local** — No cloud, no external services, no network calls
- **No secrets** — The server never reads or stores credentials

<br />

## Architecture

```
src/
├── index.ts              # MCP server bootstrap (stdio transport)
├── hooks/
│   └── session-start.ts  # SessionStart hook (standalone Node.js script)
├── memory/
│   ├── store.ts          # Filesystem abstraction + path safety + auto-healing index
│   └── initializer.ts    # Project detection + initial topic scaffolding
└── tools/
    ├── memory-tools.ts   # memory — read, write, append, delete, list
    └── session-tools.ts  # checkpoint — save work state
```

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Minimal surface** | 2 tools, not 12. Less for Claude to learn, fewer tokens wasted |
| **File-based** | Plain Markdown. No database, no cloud, no lock-in. `cat` works |
| **Auto-healing** | Corrupt metadata recovers gracefully. Invalid index entries are cleaned on read |
| **Zero config** | Detects project type (Node, Rust, Go, Python), creates structure on first use |
| **Fail-safe hook** | SessionStart hook silently no-ops on errors — never blocks Claude from starting |

<br />

## Requirements

- **Node.js** 18+
- **Claude Code** with MCP support

<br />

## Disclaimer

This project is provided **as-is**, without warranty of any kind. Memory entries are generated by Claude — treat them as helpful notes, not ground truth. Always review content before relying on it for critical decisions.

<br />

## Contributing

Issues and pull requests welcome at [github.com/ninodinoo/ninos-claude-memory-mcp](https://github.com/ninodinoo/ninos-claude-memory-mcp).

<br />

## License

**MIT with Attribution** — free to use, modify, and distribute.

Public forks and derivative works must credit the original author:

> Originally created by [ninodinoo](https://github.com/ninodinoo) — [ninos-claude-memory-mcp](https://github.com/ninodinoo/ninos-claude-memory-mcp)

See [LICENSE](LICENSE) for details.
