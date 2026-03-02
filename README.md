# OpenCode Tunnel Skill

Expose your OpenCode session to the internet via ngrok for mobile and remote access.

> **🤖 Fully Agentic:** This project — including all code, documentation, and bug fixes — was written entirely by LLM (Kimi K2.5 & Sonnet 4.6) in ([OpenCode](https://opencode.ai)).

## Features

- 🌐 **Public URLs** - Access your OpenCode session from any device
- 📱 **QR Codes** - Scan to open on mobile instantly
- 🚀 **Zero Config** - Tunnels your existing OpenCode session directly
- 📋 **Manage Multiple Tunnels** - List, track, and stop tunnels easily

## Requirements

| Requirement                                | Notes                                                 |
| ------------------------------------------ | ----------------------------------------------------- |
| **macOS**                                  | Linux and Windows not yet supported                   |
| **[ngrok](https://ngrok.com/download)**    | Tunnel client — `brew install ngrok/ngrok/ngrok`      |
| **[OpenCode](https://opencode.ai)**        | Must be running (TUI or web) before creating a tunnel |
| **Node.js**                                | Already available if OpenCode is installed            |

### Installing ngrok

```bash
# Install via Homebrew
brew install ngrok/ngrok/ngrok

# Authenticate (free account required for persistent tunnels)
ngrok config add-authtoken <your-token>

# Verify
ngrok --version
```

Get your auth token at [dashboard.ngrok.com](https://dashboard.ngrok.com).

## Usage

This is an **OpenCode agent skill**. You interact with it through natural language inside an OpenCode session — no terminal commands needed.

### Install the Skill

```bash
git clone https://github.com/YOUR_USERNAME/opencode-tunnel \
  ~/.config/opencode/skills/opencode-tunnel
```

OpenCode picks up skills automatically from `~/.config/opencode/skills/`. No restart needed.

### Create a Tunnel

Just ask in your OpenCode session:

```
/opencode-tunnel new
# or
/opencode-tunnel
# or just say: "expose my session" / "create a tunnel"
```

The agent will:

1. Find your running OpenCode session on port 3333
2. Create a password-protected ngrok tunnel pointing at it
3. Display a QR code, public URL, and login credentials

### Accessing the Tunnel

Every tunnel is protected with Basic Auth enforced by ngrok. When your browser prompts for credentials:

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| **Username** | `opencode`                                     |
| **Password** | 6-digit code shown at creation (e.g. `421481`) |

The credentials are displayed when the tunnel is created:

```
  Login:        opencode / 421481  🔐
```

And again any time with:

```
/opencode-tunnel list
```

> **Note:** On a free ngrok account, the first visit shows an interstitial warning page. Click "Visit Site" to proceed. This only appears once per browser session.


### List Running Tunnels

```
/opencode-tunnel list
```

Shows all active tunnels with their IDs, URLs, and status.

### Stop a Tunnel

```
/opencode-tunnel stop <tunnel-id>    # stop a specific tunnel
/opencode-tunnel stop                # stop all tunnels
# or just say: "stop all tunnels" / "stop tunnel tun_xxx"
```

## How It Works

The skill:

1. Discovers your running OpenCode server by polling the health endpoint on known ports (3333, 4096), falling back to `lsof` if needed
2. Fetches current project and session metadata via the OpenCode API
3. Generates a random 8-digit password for the tunnel
4. Spawns a detached tunnel process with Basic Auth enabled, pointing it at the local OpenCode port — no second OpenCode instance is started
5. Polls the tunnel's JSON log until the public URL appears
6. Saves tunnel metadata (ID, URL, PID, credentials) to `~/.config/opencode/tunnels/tunnels.json`
7. Displays the public URL, login credentials, and a QR code, then exits — the tunnel runs independently in the background

### Why We Tunnel the Existing Process (Not a New One)

Early versions spawned a separate `opencode serve` process. This caused read-only behavior in the browser because the new process had no knowledge of the TUI session state. Tunneling the running process directly gives full read/write access.

### URL Format

```
https://<tunnel-host>/{base64(directory)}/session/{session_id}
```

Example:

- Directory: `/Users/tetsusoh/repos/project`
- Base64: `L1VzZXJzL3RldHN1c29oL3JlcG9zL3Byb2plY3Q=`
- Full URL: `https://<tunnel-host>/L1Vz.../session/ses_xxx`

## Why Not Cloudflare Tunnel?

**Cloudflare Tunnel (`cloudflared`) does not work with OpenCode's streaming responses.**

OpenCode uses [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) on the `/global/event` endpoint to stream AI responses back to the browser in real time. Cloudflare's tunnel proxies HTTP/2 by default and buffers or drops SSE frames, causing the AI response stream to never arrive in the browser — you see the user message appear but the assistant response never streams back.

ngrok handles SSE correctly by preserving the HTTP/1.1 chunked transfer encoding that SSE relies on.

| Feature                     | cloudflared      | ngrok         |
| --------------------------- | ---------------- | ------------- |
| SSE / streaming responses   | ❌ Broken        | ✅ Works      |
| Free tier                   | ✅ No account    | ✅ Free tier  |
| Persistent URL              | ❌ Ephemeral     | ❌ Ephemeral  |
| First-visit interstitial    | ❌ None          | ⚠️ Warning    |

## Troubleshooting

| Issue                           | Solution                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| "No OpenCode server found"      | Ensure OpenCode TUI or web is running                           |
| "Failed to start ngrok"         | Install with `brew install ngrok/ngrok/ngrok`                   |
| ngrok exits immediately         | Run `ngrok config add-authtoken <token>` first                  |
| AI responses don't stream back  | This is the cloudflared SSE bug — use ngrok instead             |
| Browser asks for login      | Username: `opencode`, Password: from `list` output              |
| Session doesn't open            | Verify session exists and is active                             |

## Limitations

- **macOS only** — Linux and Windows support planned for a future release
- Tunnel URL changes on each restart (ngrok free tunnels are ephemeral)
- Only exposes the currently running OpenCode session
- Local machine must stay online for the tunnel to work
- ngrok free tier shows an interstitial on first visit per browser session

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Acknowledgments

- Built for [OpenCode](https://opencode.ai)
- Uses [ngrok](https://ngrok.com) for tunneling
