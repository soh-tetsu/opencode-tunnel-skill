---
name: opencode-tunnel
description: Expose OpenCode sessions to the internet via secure tunnel for mobile and remote access. Supports multiple providers - ngrok (public) and tailscale (private tailnet).
---

## What I Do

When the user wants to expose their OpenCode session to the internet, I will:

1. **Check prerequisites** - Verify at least one tunnel provider is installed (`ngrok` or `tailscale`)
2. **Discover OpenCode** - Find the running OpenCode server port (3333 or 4096)
3. **Get session info** - Fetch current session details and project directory via OpenCode API
4. **Use provider** - Select the user's preferred provider (or auto-select first available)
5. **Execute tunnel** - Run the tunnel script: `node ~/.config/opencode/skills/opencode-tunnel/tunnel.js`
6. **Present results** - Display the tunnel URL, QR code, and access credentials

## When to Use Me

Trigger this skill when the user says:
- "Expose my session to internet"
- "Create tunnel for my session"
- "Access my session from mobile"
- "Share my opencode session"
- `/opencode-tunnel` (with or without additional text)
- "Make my session public"
- "Remote access to my session"
- "List running tunnels"
- "Stop tunnel [id]"
- "Show tunnel status"
- "Switch provider" / "Use tailscale" / "Use ngrok"

## Default Behavior

If the user invokes this skill with an empty request (e.g., just `/opencode-tunnel` with no additional words), the skill will enter **interactive mode** and prompt:

```
Create a new tunnel? [Y/n]:
```

Press `Enter` or type `y`/`yes` to proceed with creating a tunnel. Type `n`/`no` to cancel.

## Provider System

The skill supports multiple tunnel providers through a registration pattern:

### Available Providers

| Provider | Best For | URL Type |
|----------|----------|----------|
| **ngrok** | Public internet access | Random public URL |
| **tailscale** | Private tailnet access | Fixed `*.ts.net` URL |

### Provider Commands

```bash
# Show current provider and available options
node tunnel.js provider

# Switch to ngrok (public internet)
node tunnel.js provider ngrok

# Switch to tailscale (private tailnet)
node tunnel.js provider tailscale
```

The last used provider is automatically saved as the default for future tunnels.

## Output Format

When displaying tunnel URLs, always print the **complete full URL** without truncation or collapsing. Never use `...` to shorten URLs - show the entire URL from `https://` to the end, including the full base64-encoded directory path and session ID.

## Commands

```bash
# Provider management
node tunnel.js provider              # Show available providers
node tunnel.js provider ngrok        # Switch to ngrok
node tunnel.js provider tailscale    # Switch to tailscale

# Create a new tunnel (interactive)
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js

# Create a new tunnel
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js create

# List all running tunnels
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js list
# or: node tunnel.js ls

# Stop a specific tunnel
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js stop <tunnel-id>
# or: node tunnel.js kill <tunnel-id>

# Stop all tunnels
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js stop

# Show help
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js help
```

## Prerequisites

The skill requires these to be available:

1. **At least one tunnel provider:**
   - **ngrok** (public internet)
     - Install: `brew install ngrok` or https://ngrok.com
     - Verify: `which ngrok`
   - **tailscale** (private tailnet)
     - Install: `brew install tailscale`
     - Setup: `sudo tailscale up`
     - Verify: `tailscale status`

2. **OpenCode running** - Must have an active OpenCode TUI or web session

3. **qrcode** - NPM package (already available in `~/.config/opencode/node_modules`)

## Expected Output

After running, the user will see:

**ngrok:**
```
────────────────────────────────────────────────────────────
  🌐 TUNNEL READY
────────────────────────────────────────────────────────────

  Provider:     ngrok
  Tunnel ID:    tun_1234567890_abc123
  URL:          https://xxx.ngrok-free.dev/L1Vz.../session/ses_xxx
  Login:        opencode / 421481  🔐
  Session:      My Session Title

  📱 SCAN THIS QR CODE WITH YOUR PHONE CAMERA

  [QR CODE]

  ✅ Tunnel is running in background
  🔐 Login: username=opencode  password=421481
```

**tailscale:**
```
────────────────────────────────────────────────────────────
  🌐 TUNNEL READY
────────────────────────────────────────────────────────────

  Provider:     tailscale
  Tunnel ID:    tun_1234567890_abc123
  URL:          https://myhost.tailnet.ts.net/L1Vz.../session/ses_xxx
  Auth:         Tailscale SSO (no password needed)
  Session:      My Session Title

  📱 SCAN THIS QR CODE WITH YOUR PHONE CAMERA

  [QR CODE]

  ✅ Tunnel is running in background
```

## How the URL Works

The OpenCode web UI uses this URL format:
```
/{base64(directory)}/session/{session_id}
```

Example:
- Directory: `/Users/tetsusoh/repos/project`
- Base64: `L1VzZXJzL3RldHN1c29oL3JlcG9zL3Byb2plY3Q=`
- Full URL: `https://<tunnel-host>/<base64(directory)>/session/<session_id>`

## Authentication

### ngrok
- **Username:** `opencode`
- **Password:** Random 8-digit code generated per tunnel
- **Security:** Basic auth enforced by ngrok edge servers

### tailscale
- **Authentication:** Tailscale SSO (no password needed)
- **Access:** Only users on your tailnet can access
- **Security:** Controlled by Tailscale ACLs and network membership

## Troubleshooting

**"No tunnel providers available"**
- Install ngrok: `brew install ngrok`
- Or install tailscale: `brew install tailscale && sudo tailscale up`

**"No OpenCode server found"**
- Ensure OpenCode TUI or web is running
- Check ports 3333 and 4096

**"Failed to start ngrok"**
- Install ngrok: `brew install ngrok` or https://ngrok.com/download
- Verify it's in PATH: `which ngrok`

**"Failed to start tailscale"**
- Ensure tailscale daemon is running: `sudo tailscale up`
- Check status: `tailscale status`

**ngrok exits immediately**
- Run `ngrok config add-authtoken <token>` first

**Session doesn't open**
- Verify the session exists and is active
- Check that the session ID is correct

**ngrok browser warning page**
- Free ngrok accounts show a warning on first visit
- Workarounds: Click "Visit Site", use mobile browser, or switch to tailscale

## Managing Tunnels

### List Running Tunnels

To see all active tunnels with their IDs, URLs, and providers:

```bash
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js list
```

This shows:
- Tunnel ID (used for stopping)
- Status (running/stopped)
- Provider (ngrok/tailscale)
- Public URL
- Session name and ID
- Local port
- Creation time

### Stop a Tunnel

To stop a specific tunnel:

```bash
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js stop <tunnel-id>
```

To stop **all** running tunnels:

```bash
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js stop
```

## Limitations
- Requires at least one provider (ngrok or tailscale)
- ngrok free tier: URL changes each time, shows warning page
- tailscale: Requires tailnet membership to access
- macOS only (Linux and Windows support planned)
- Local machine must stay online
