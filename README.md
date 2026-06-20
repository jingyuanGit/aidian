# Aidian

![Preview](assets/Preview.png)

An Obsidian plugin that embeds AI coding agents (Claude Code, Codex, Opencode, Pi, and more to come) in your vault. Your vault becomes the agent's working directory — file read/write, search, bash, and multi-step workflows all work out of the box.

Aidian is a personal fork of [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu, extended with Android support: a WebSocket bridge lets the plugin reach a Claude Code CLI process running inside OperitAI on the device, since Obsidian Mobile has no Node.js runtime to spawn a CLI directly.

## Features & Usage

Open the chat sidebar from the ribbon icon or command palette. Select text and use the hotkey for inline edit. Everything works like your familiar coding agent, Claude Code, Codex, Opencode, and Pi — talk to the agent, and it reads, writes, edits, and searches files in your vault.

**Inline Edit** — Select text or start at the cursor position + hotkey to edit directly in notes with word-level diff preview.

**Slash Commands & Skills** — Type `/` or `$` for reusable prompt templates or Skills from user- and vault-level scopes.

**`@mention`** - Type `@` to mention anything you want the agent to work with, vault files, subagents, MCP servers, or files in external directories.

**Plan Mode** — Toggle via `Shift+Tab`. The agent explores and designs before implementing, then presents a plan for approval.

**Instruction Mode (`#`)** — Refined custom instructions added from the chat input.

**MCP Servers** — Connect external tools via Model Context Protocol (stdio, SSE, HTTP). Claude manages vault MCP in-app; Codex uses its own CLI-managed MCP configuration.

**Multi-Tab & Conversations** — Multiple chat tabs, conversation history, fork, resume, and compact.

## Requirements

- **Claude provider**: [Claude Code CLI](https://code.claude.com/docs/en/overview) installed (native install recommended). Claude subscription/API or compatible provider ([Openrouter](https://openrouter.ai/docs/guides/guides/claude-code-integration), [Kimi](https://platform.moonshot.ai/docs/guide/agent-support), etc.).
- **Optional providers**: [Codex CLI](https://github.com/openai/codex), [Opencode](https://opencode.ai/), [Pi](https://github.com/earendil-works/pi).
- Obsidian v1.7.2+
- Desktop (macOS, Linux, Windows), or Android via the OperitAI bridge (see below)

## Installation

### Desktop, from source

1. Clone this repository into your vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/jingyuanGit/aidian.git
   cd aidian
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian:
   - Settings → Community plugins → Enable "Aidian"

### Development

```bash
# Watch mode
npm run dev

# Production build
npm run build
```

### Android, via the OperitAI bridge

Obsidian Mobile runs in a WebView with no Node.js, so the Claude CLI can't be spawned locally on the device. Instead, the plugin connects over a WebSocket to a small Python bridge server that runs inside OperitAI and spawns the CLI there:

```
Obsidian (Aidian plugin, WebView)
  ↓ WebSocket (ws://localhost:7869/spawn)
android-bridge/server.py (Python aiohttp, runs inside OperitAI)
  ↓ subprocess stdin/stdout
claude CLI
```

Setup:

1. Build and patch the plugin for mobile:
   ```bash
   npm run build
   node scripts/patch-mobile.js
   ```
2. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/aidian/` on the device.
3. Inside OperitAI, install `aiohttp` and run the bridge server:
   ```bash
   pip3 install aiohttp
   python3 android-bridge/server.py [PORT]   # default port 7869
   ```
4. In Obsidian, enable the plugin, then in Settings → Claude → Android Bridge, turn it on and set the host/port the bridge is listening on.

`patch-mobile.js` wraps the built bundle with polyfills for the Node.js built-ins (`events`, `fs`, `path`, `child_process`, `os`, `crypto`, `readline`, `stream`, etc.) that the Claude SDK expects but that don't exist in a mobile WebView. On desktop (Electron), the real `require` is detected and used instead, so behavior there is unchanged.

## Privacy & Data Use

- **Sent to API**: Your input, attached files, images, and tool call outputs. Default: Anthropic (Claude), OpenAI (Codex), or the provider configured in Opencode/Pi; configurable via provider settings and environment variables.
- **Local storage**: Aidian settings and session metadata in `vault/.aidian/`; Claude provider files in `vault/.claude/`; transcripts in `~/.claude/projects/` (Claude), `~/.codex/sessions/` (Codex), and `.pi/agent/sessions/` or `~/.pi/agent/sessions/` (Pi).
- **Environment variables**: Provider subprocesses inherit the Obsidian process environment plus any variables you configure in Aidian. This is needed for CLI authentication, proxies, certificates, and PATH resolution.
- **Device-specific paths**: Per-device CLI paths use an opaque local key stored in browser local storage, not your system hostname.
- **Background activity**: Aidian does not run telemetry beacons. UI polling timers read local Obsidian/editor selection state only. Network activity is limited to explicit provider runtime work, configured MCP endpoints, provider SDK/CLI calls needed to answer your requests, and — on Android — the WebSocket connection to the OperitAI bridge.

## Troubleshooting

### Claude CLI not found

If you encounter `spawn claude ENOENT` or `Claude CLI not found`, the plugin can't auto-detect your Claude installation. Common with Node version managers (nvm, fnm, volta).

**Solution**: Leave the setting empty first so Aidian can auto-detect Claude Code. If auto-detection fails, find your CLI path and set it in Settings → Advanced → Claude CLI path.

| Platform | Command | Example Path |
|----------|---------|--------------|
| macOS/Linux | `which claude` | `/Users/you/.volta/bin/claude` |
| Windows (native) | `where.exe claude` | `C:\Users\you\AppData\Local\Claude\claude.exe` |
| Windows (npm) | `npm root -g` | `{root}\@anthropic-ai\claude-code\cli-wrapper.cjs` |

> **Note**: On Windows, avoid `.cmd` and `.ps1` wrappers. Use `claude.exe` for native installs, or `cli-wrapper.cjs` for package-manager installs. `cli.js` is only a legacy fallback for older Claude Code npm packages.

**Alternative**: Add your Node.js bin directory to PATH in Settings → Environment → Custom variables.

### npm CLI and Node.js not in same directory

If using npm-installed CLI, check if `claude` and `node` are in the same directory:
```bash
dirname $(which claude)
dirname $(which node)
```

If different, GUI apps like Obsidian may not find Node.js.

**Solutions**:
1. Install native binary (recommended)
2. Add Node.js path to Settings → Environment: `PATH=/path/to/node/bin`

### Android bridge not connecting

- Confirm the bridge server is running inside OperitAI and reachable at the host/port configured in Settings → Claude → Android Bridge (`curl http://<host>:<port>/health` should return `{"status":"ok"}`).
- The bridge spawns `claude` with `cwd` set to `/sdcard/<vault folder name>` — make sure the vault actually lives under `/sdcard` on the device and the folder name matches.
- Android Bridge mode forces `permissionMode: acceptEdits` and disables `bypassPermissions`, since there's no real OS process sandbox on the bridge side.

### Other providers

Codex, Opencode, and Pi support are live but features might be incomplete, and still need more testing across platforms and installation methods. If you run into bugs, please open an issue on this fork.

## Architecture

```
src/
├── main.ts                      # Plugin entry point
├── app/                         # Shared defaults and plugin-level storage
├── core/                        # Provider-neutral runtime, registry, and type contracts
│   ├── runtime/                 # ChatRuntime interface and approval types
│   ├── providers/               # Provider registry and workspace services
│   ├── auxiliary/               # Shared provider auxiliary services
│   ├── bootstrap/               # Plugin bootstrap wiring
│   ├── security/                # Approval utilities
│   └── ...                      # commands, mcp, prompt, storage, tools, types
├── providers/
│   ├── claude/                  # Claude SDK adaptor, prompt encoding, storage, MCP, plugins
│   │   └── runtime/androidBridgeSpawn.ts  # WebSocket spawn shim for the OperitAI bridge
│   ├── codex/                   # Codex app-server adaptor, JSON-RPC transport, JSONL history
│   ├── opencode/                # Opencode adaptor
│   ├── pi/                      # Pi RPC adaptor, model discovery, JSONL history
│   └── acp/                     # Agent Client Protocol shared transport
├── features/
│   ├── chat/                    # Sidebar chat: tabs, controllers, renderers
│   ├── inline-edit/             # Inline edit modal and provider-backed edit services
│   └── settings/                # Settings shell with provider tabs
├── shared/                      # Reusable UI components and modals
├── i18n/                        # Internationalization (10 locales)
├── types/                       # Shared ambient types
├── utils/                       # Cross-cutting utilities
└── style/                       # Modular CSS

android-bridge/
└── server.py                    # Python aiohttp WebSocket bridge, runs inside OperitAI
```

## License

Licensed under the [MIT License](LICENSE).

## Acknowledgments

- [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu, the upstream project this fork builds on
- [Obsidian](https://obsidian.md) for the plugin API
- [Anthropic](https://anthropic.com) for Claude and the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [OpenAI](https://openai.com) for [Codex](https://github.com/openai/codex)
- [Opencode](https://opencode.ai/)
- [Pi](https://github.com/earendil-works/pi)
- OperitAI for the on-device runtime the Android bridge connects to
