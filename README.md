# OpenCode Tunnel Skill

Expose your OpenCode session to the internet via secure tunnel for mobile and remote access. Supports multiple providers: **ngrok** (public internet) and **Tailscale** (your tailnet).

> **🤖 Fully Agentic:** This project — including all code, documentation, and bug fixes — was written entirely by LLM (Kimi K2.5 & Sonnet 4.6) in ([OpenCode](https://opencode.ai)).

## Features

- 🌐 **Public URLs** - Access from any device (ngrok)
- 🔒 **Private URLs** - Access within your Tailscale network
- 📱 **QR Codes** - Scan to open on mobile instantly
- 🚀 **Zero Config** - Tunnels your existing OpenCode session
- 🔌 **Pluggable Providers** - Registration pattern for easy extension
- 📋 **Provider Selection** - Switch between ngrok and tailscale

## Requirements

| Requirement | Notes |
|-------------|-------|
| **macOS** | Linux and Windows not yet supported |
| **ngrok** OR **Tailscale** | At least one tunnel provider installed |
| **[OpenCode](https://opencode.ai)** | Must be running (TUI or web) |
| **Node.js** | Already available if OpenCode is installed |

### Provider Comparison

Choose the provider that fits your needs:

| Feature | ngrok | Tailscale |
|---------|-------|-----------|
| **Visibility** | Public internet | Your private tailnet only |
| **URL** | Random on each start | Fixed: `https://your-host.tailnet.ts.net` |
| **Authentication** | Basic auth (password) | Tailscale SSO |
| **Browser Warning** | ⚠️ Yes (free tier) | ❌ No |
| **Account Required** | Optional (free tier) | Yes (free personal plan) |

### Installing Tailscale ⭐ Recommended

Tailscale is the **recommended** provider for secure, private access to your OpenCode session.

```bash
# Install via Homebrew
brew install tailscale

# Start the daemon and login to your tailnet
sudo tailscale up

# Verify you're connected
tailscale status
```

Sign up at [tailscale.com](https://tailscale.com) if you don't have an account.

**To access your tunnel from other devices**, they must be connected to your tailnet:  
[Tailscale Quickstart Guide →](https://tailscale.com/docs/how-to/quickstart)

### Installing ngrok

Use ngrok for quick public sharing (no account required for basic use).

```bash
# Install via Homebrew
brew install ngrok

# (Optional) Authenticate for stable URLs
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

### Select a Provider

Check available providers and switch between them:

```bash
# Show current provider and available options
node tunnel.js provider

# Switch to ngrok (public internet)
node tunnel.js provider ngrok

# Switch to tailscale (private tailnet)
node tunnel.js provider tailscale
```

The last used provider is saved as the default for future tunnels.

### Create a Tunnel

Just ask in your OpenCode session:

```
/opencode-tunnel new
# or
/opencode-tunnel
# or just say: "expose my session" / "create a tunnel"
```

The agent will:

1. Discover your running OpenCode server via `lsof`
2. Use your selected provider (or auto-select first available)
3. Create a tunnel pointing at your OpenCode port
4. Display a QR code, public URL, and login credentials (if applicable)

### Provider Comparison

| Feature | Tailscale | ngrok | Cloudflare Tunnel |
|---------|-----------|-------|-------------------|
| **Visibility** | Your private tailnet | Public internet | Public internet |
| **Best for** | Team/secure access | Sharing with anyone | - |
| **URL** | Fixed hostname | Random on each start | Fixed hostname |
| **Authentication** | Tailscale SSO | Basic auth (password) | Cloudflare Access |
| **Browser warning** | ❌ No | ⚠️ Yes (free tier) | ❌ No |
| **Account required** | Yes (free plan) | Optional | Yes |
| **SSE/Streaming** | ✅ Works | ✅ Works | ❌ **Broken** |
| **Support Status** | ✅ Supported | ✅ Supported | ❌ Not supported |

> **Note:** Cloudflare Tunnel is not supported because it breaks OpenCode's real-time streaming (SSE). We recommend **ngrok** for public sharing or **Tailscale** for private/team access.

### Accessing the Tunnel

| Provider | Access Method | Instructions |
|----------|---------------|--------------|
| **ngrok** | Basic Auth | Username: `opencode`<br>Password: 8-digit code from creation |
| **Tailscale** | Tailscale SSO | 1. Install Tailscale: https://tailscale.com/download<br>2. Sign in to your tailnet<br>3. Open the URL |

### List Running Tunnels

```
/opencode-tunnel list
```

Shows all active tunnels with their IDs, URLs, provider, and status.

### Stop a Tunnel

```
/opencode-tunnel stop <tunnel-id>    # stop a specific tunnel
/opencode-tunnel stop                # stop all tunnels
# or just say: "stop all tunnels" / "stop tunnel tun_xxx"
```

## How It Works

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                      YOUR LOCAL MACHINE                            │
│                                                                    │
│  ┌──────────────┐      ┌──────────────┐      ┌─────────────────┐  │
│  │   OpenCode   │◄────►│ Tunnel Skill │◄────►│ Tunnel Provider │  │
│  │  (Port 3333) │      │ (tunnel.js)  │      │ (ngrok/tailscale)│  │
│  └──────────────┘      └──────────────┘      └────────┬────────┘  │
│                                                       │            │
└───────────────────────────────────────────────────────┼────────────┘
                                                        │
                                                        ▼
                                            ┌─────────────────────┐
                                            │  TUNNEL SERVICE     │
                                            │  (Tailscale/ngrok   │
                                            │   infrastructure)   │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │   PUBLIC URL        │
                                            │  https://xxx...     │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │  REMOTE DEVICES     │
                                            │  (Phone, Tablet...) │
                                            └─────────────────────┘
```

**The flow:**
1. **OpenCode** runs locally on port 3333
2. **Tunnel Skill** discovers OpenCode and selects your provider
3. **Tunnel Provider** (ngrok/tailscale binary) runs locally and connects to their service
4. **Tunnel Service** creates the public endpoint and assigns a URL
5. **Remote devices** access your OpenCode via the public URL

### Provider Registration Pattern

### Provider Registration Pattern

The skill uses a **provider registration pattern**:

1. **Provider Interface** - All providers implement a common `TunnelProvider` interface
2. **Registration** - Providers auto-register themselves on load
3. **Selection** - User selects default provider (saved to `~/.config/opencode/tunnels/provider.json`)
4. **Execution** - Selected provider handles tunnel creation/management

### Architecture

```
tunnel.js
├── providers/
│   ├── index.js      # Provider interface & registry
│   ├── ngrok.js      # NgrokProvider
│   └── tailscale.js  # TailscaleProvider
└── ...
```

Adding a new provider is simple:

1. Create `providers/yours.js`
2. Extend `TunnelProvider` class
3. Implement required methods (`isAvailable()`, `startTunnel()`, etc.)
4. Call `registerProvider('yours', new YourProvider())`

### Why We Tunnel the Existing Process (Not a New One)

Early versions spawned a separate `opencode serve` process. This caused read-only behavior in the browser because the new process had no knowledge of the TUI session state. Tunneling the running process directly gives full read/write access.

### URL Format

```
https://<tunnel-host>/{base64(directory)}/session/{session_id}
```

Example:

- Directory: `/Users/tetsusoh/repos/project`
- Base64: `L1VzZXJzL3RldHN1c29oL3JlcG9zL3Byb2plY3Q=`
- Full URL: `https://<tunnel-host>/<base64(directory)>/session/<session_id>`

## Provider-Specific Notes

### ngrok Browser Warning Page (Free Tier)

When accessing a tunnel on a free ngrok account, the first visit from each browser shows a warning page:

```
To remove this page:
    Set and send an ngrok-skip-browser-warning request header with any value.
    Or, set and send a custom/non-standard browser User-Agent request header.
    Or, please upgrade to any paid ngrok account.
```

**Why this happens:** ngrok free tier shows this interstitial to prevent abuse.

**Workarounds:**

1. **Click "Visit Site"** — The warning only appears once per browser session

2. **Browser extension** — Install a header modifier (like "ModHeader") and add:
   - Header name: `ngrok-skip-browser-warning`
   - Header value: `true`

3. **Use mobile** — Many mobile browsers (Safari iOS, Chrome Android) use non-standard User-Agent strings that bypass the warning

4. **Upgrade ngrok** — Paid accounts don't show this page

5. **Use Tailscale instead** — No warning page, but requires Tailscale network membership

### Tailscale Serve

Tailscale tunnels use `tailscale serve` which exposes your service only to your private tailnet (not the public internet). The URL is your machine's Tailscale DNS name:

```
https://your-machine.tailnet-name.ts.net
```

**Key differences from ngrok:**
- **Private only** — Only devices on your tailnet can access the URL
- **No browser warning** — Unlike ngrok free tier
- **Fixed URL** — Your hostname stays the same across restarts
- **Tailscale auth** — Users must be signed into your tailnet (no password needed)

This is ideal for internal team access or when you want to avoid the ngrok warning page. For public internet access, use ngrok instead.
## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No OpenCode server found" | Ensure OpenCode TUI or web is running |
| "Failed to start ngrok" | Install with `brew install ngrok` |
| "Failed to start tailscale" | Run `sudo tailscale up` first |
| ngrok exits immediately | Run `ngrok config add-authtoken <token>` first |
| Tailscale hostname not found | Ensure `tailscale status` shows connected |
| AI responses don't stream back | This is the cloudflared SSE bug — use ngrok or tailscale |
| Browser asks for login | ngrok: username=`opencode`, password=from `list` output. Tailscale: no password needed |
| Session doesn't open | Verify the session exists and is active |

## Limitations

- **macOS only** — Linux and Windows support planned
- **ngrok free tier** — Tunnel URL changes on each restart, shows warning page
- **Tailscale** — Requires tailnet membership to access
- Local machine must stay online for the tunnel to work

## Planned / Future Work

- **Linux & Windows support**
- **Additional tunnel providers** — Cloudflare (if SSE issues resolved), LocalTunnel, etc.
- **Provider configuration** — Per-provider settings (ports, auth, etc.)

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
- Supports [ngrok](https://ngrok.com) and [Tailscale](https://tailscale.com) tunneling
