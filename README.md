# OpenCode Tunnel Skill

Expose your OpenCode sessions to the internet via Cloudflare Tunnel for mobile and remote access.

## Features

- 🌐 **Public URLs** - Access your OpenCode session from any device
- 📱 **QR Codes** - Scan to open on mobile instantly
- 🔒 **Password Protected** - Auto-generated credentials on every tunnel
- 🚀 **Zero Config** - Works out of the box with your existing OpenCode setup
- 📋 **Manage Multiple Tunnels** - List, track, and stop tunnels easily

## Requirements

| Requirement | Notes |
|-------------|-------|
| **macOS** | Linux and Windows not yet supported |
| **[Homebrew](https://brew.sh)** | Used to install `cloudflared` |
| **[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)** | Cloudflare Tunnel client — `brew install cloudflared` |
| **[OpenCode](https://opencode.ai)** | Must be running (TUI or web) before creating a tunnel |
| **Node.js** | Already available if OpenCode is installed |

> **No Cloudflare account needed.** The skill uses [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (free, no sign-up, no configuration). The `cloudflared` binary handles everything automatically.

### Installing cloudflared

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install cloudflared
brew install cloudflared

# Verify
cloudflared --version
```

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
1. Find your running OpenCode session
2. Start a password-protected headless OpenCode server
3. Create a Cloudflare tunnel
4. Display a QR code, public URL, and login credentials

### Accessing the Tunnel

Every tunnel is protected with Basic authentication. When your browser prompts for credentials:

| Field | Value |
|-------|-------|
| **Username** | `opencode` |
| **Password** | 6-digit code shown at creation (e.g. `421481`) |

The credentials are displayed when the tunnel is created:

```
  Login:        opencode / 421481  🔐
```

And again any time with:

```
/opencode-tunnel list
```

> The password is randomly generated each time you create a tunnel. Always check `list` if you forget it.

### List Running Tunnels

```
/opencode-tunnel list
```

Shows all active tunnels with their IDs, URLs, login credentials, and status.

### Stop a Tunnel

```
/opencode-tunnel stop <tunnel-id>    # stop a specific tunnel
/opencode-tunnel stop                # stop all tunnels
# or just say: "stop all tunnels" / "stop tunnel tun_xxx"
```

## How It Works

The skill:
1. Discovers your OpenCode server (port 3333 or 4096)
2. Gets your current session info via the OpenCode API
3. Starts a **headless** OpenCode server (`opencode serve`) with a random password set via `OPENCODE_SERVER_PASSWORD`
4. Creates a Cloudflare tunnel to expose it publicly
5. Generates a QR code for easy mobile access

### URL Format

```
https://xxx.trycloudflare.com/{base64(directory)}/session/{session_id}
```

Example:
- Directory: `/Users/tetsusoh/repos/project`
- Base64: `L1VzZXJzL3RldHN1c29oL3JlcG9zL3Byb2plY3Q=`
- Full URL: `https://xxx.trycloudflare.com/L1Vz.../session/ses_xxx`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No OpenCode server found" | Ensure OpenCode TUI or web is running |
| "Failed to start cloudflared" | Install with `brew install cloudflared` |
| Browser shows login prompt | Username: `opencode`, Password: shown in `list` output |
| Session doesn't open | Verify session exists and is active |
| Tunnel stopped but process lingers | Run `node tunnel.js stop` — it kills all tracked processes |

## Limitations

- **macOS only** — Linux and Windows support planned for a future release
- Tunnel URL changes on each restart (Cloudflare Quick Tunnels are ephemeral)
- Only exposes the currently running OpenCode session
- Local machine must stay online for the tunnel to work

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
- Uses [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
