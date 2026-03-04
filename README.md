# claude-memory-mcp

> An MCP server for Claude Code that prevents **context rot** — the gradual loss of project knowledge as conversations grow longer.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)

---

## The Problem

Claude Code is powerful, but long sessions lead to **context rot**: earlier decisions get forgotten, architectural context fades, and responses become inconsistent. The longer a session runs, the more knowledge is silently lost.

## The Solution

`claude-memory-mcp` gives Claude a persistent memory layer. It stores project knowledge in a local `.claude-memory/` folder inside your project and exposes tools that Claude can call to save, retrieve, and search that knowledge — automatically, across sessions.

Only what's relevant to the current task gets loaded, so memory never bloats your context.

---

## Features

- **Persistent knowledge** across sessions and context resets
- **Smart loading** — fetch only what's relevant, not everything at once
- **Session checkpoints** — save progress mid-session so nothing is lost
- **Session summaries** — compress and archive each session automatically
- **Full-text search** across all memory entries
- **Self-organizing** — entries track access frequency and timestamps
- **Zero dependencies on external services** — everything stays local

---

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) with MCP support

---

## Installation

### 1. Clone and build

```bash
git clone https://github.com/etwsentwNino/claude-memory-mcp.git
cd claude-memory-mcp
npm install
npm run build
```

### Alternatively: Use via npx (no clone required)

In `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "claude-memory": {
      "command": "npx",
      "args": ["-y", "claude-memory-mcp"]
    }
  }
}
```

### 2. Register the plugin in Claude Code

Open (or create) `~/.claude/settings.json` and add the `mcpServers` entry:

```json
{
  "mcpServers": {
    "claude-memory": {
      "command": "node",
      "args": ["/absolute/path/to/claude-memory-mcp/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/claude-memory-mcp` with the actual path where you cloned the repo.

**Windows example:**
```json
"args": ["C:/Users/yourname/claude-memory-mcp/dist/index.js"]
```

**macOS / Linux example:**
```json
"args": ["/home/yourname/claude-memory-mcp/dist/index.js"]
```

### 3. Restart Claude Code

After saving `settings.json`, restart Claude Code. The plugin is now active and Claude has access to all memory tools.

---

## Setup in your project

To make Claude use the memory tools automatically, add the following snippet to your project's `CLAUDE.md`:

```markdown
## Memory

At the start of every session:
1. Call `memory_list` to see what's stored
2. Call `memory_load("current-task")` to restore the last working state

During the session:
- Call `checkpoint` after every significant change (feature done, bug fixed, refactor complete)
- Call `memory_save("decisions", ...)` when making architectural or design decisions

At the end of the session:
- Call `session_summary` to compress and archive the session before context fills up
```

That's it. Claude will follow these instructions automatically.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `memory_load(topic)` | Load stored knowledge for a specific topic |
| `memory_save(topic, content, tags?)` | Save or overwrite knowledge for a topic |
| `memory_append(topic, content)` | Append content without overwriting |
| `memory_delete(topic)` | Delete a memory entry |
| `memory_list` | List all existing memory topics |
| `memory_search(query)` | Full-text search across all memory entries |
| `memory_stats` | Show memory store statistics |
| `memory_diff(since?)` | Show changes since a point in time |
| `memory_compress(olderThanDays?)` | Compress old session archives |
| `context_suggest(task, maxTopics?)` | Suggest relevant topics for a task |
| `memory_init` | Initialize project memory |
| `checkpoint(summary, nextSteps?, blockers?)` | Save current progress snapshot |
| `session_summary(accomplishments, decisions?, nextSession?)` | Archive the current session |

### Topic naming

Topics map directly to files and folders inside `.claude-memory/`. Use slashes for nesting:

| Topic | File |
|-------|------|
| `current-task` | `.claude-memory/current-task.md` |
| `architecture` | `.claude-memory/architecture.md` |
| `decisions` | `.claude-memory/decisions.md` |
| `entities/UserService` | `.claude-memory/entities/UserService.md` |

---

## Memory file format

Each entry is a plain Markdown file with a small JSON metadata header:

```
<!-- META:{"created":"2025-01-01T10:00:00Z","updated":"2025-01-02T14:30:00Z","accessCount":5,"tags":["architecture"]} -->

## Architecture Overview

We use a monorepo with the following structure...
```

Files are human-readable and can be edited manually at any time.

---

## How the memory folder looks in practice

```
your-project/
├── src/
├── package.json
└── .claude-memory/         ← created automatically by the plugin
    ├── index.json          ← topic index for fast listing
    ├── current-task.md     ← latest checkpoint
    ├── architecture.md
    ├── decisions.md
    ├── entities/
    │   └── UserService.md
    └── sessions/
        └── 01-02-2025.md  ← session archive
```

Add `.claude-memory/` to your `.gitignore` to keep it local, or commit it to share project memory with your team.

---

## License

MIT — use it, fork it, improve it.
