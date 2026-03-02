---
name: opencode-tunnel
description: Expose OpenCode sessions to the internet via ngrok tunnel for mobile and remote access
---

## What I Do

When the user wants to expose their OpenCode session to the internet, I will:

1. **Check prerequisites** - Verify ngrok is installed (`which ngrok`)
2. **Discover OpenCode** - Find the running OpenCode server port (3333 or 4096)
3. **Get session info** - Fetch current session details and project directory via OpenCode API
4. **Execute tunnel** - Run the tunnel script: `node ~/.config/opencode/skills/opencode-tunnel/tunnel.js`
5. **Present results** - Display the tunnel URL and QR code to the user
6. **Provide instructions** - Tell user the tunnel URL and how to stop it with `node tunnel.js stop <tunnel-id>`

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
## Default Behavior

If the user invokes this skill with an empty request (e.g., just `/opencode-tunnel` with no additional words), the skill will enter **interactive mode** and prompt:

```
Create a new tunnel? [Y/n]:
```

Press `Enter` or type `y`/`yes` to proceed with creating a tunnel. Type `n`/`no` to cancel.

## Commands

```bash
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

1. **ngrok** - ngrok tunnel client
   - Install: `brew install ngrok` or download from https://ngrok.com
   - Verify: `which ngrok`

2. **OpenCode running** - Must have an active OpenCode TUI or web session

3. **qrcode** - NPM package (already available in `~/.config/opencode/node_modules`)

## Expected Output

After running, the user will see:

```
────────────────────────────────────────────────────────────
  🌐 TUNNEL READY
────────────────────────────────────────────────────────────

  Tunnel ID:    tun_1234567890_abc123
  URL:          https://xxx.ngrok-free.dev/L1Vz.../session/ses_xxx
  Login:        opencode / 421481  🔐
  Session:      My Session Title

  📱 SCAN THIS QR CODE WITH YOUR PHONE CAMERA

  [QR CODE]

  ✅ Tunnel is running in background
  🔐 Login: username=opencode  password=421481
```
## How the URL Works

The OpenCode web UI uses this URL format:
```
/{base64(directory)}/session/{session_id}
```

Example:
- Directory: `/Users/tetsusoh/repos/project`
- Base64: `L1VzZXJzL3RldHN1c29oL3JlcG9zL3Byb2plY3Q=`
- Full URL: `https://xxx.ngrok-free.dev/L1Vz.../session/ses_xxx`

## Troubleshooting

If issues occur:

**"No OpenCode server found"**
- Ensure OpenCode TUI or web is running
- Check ports 3333 and 4096

**"Failed to start ngrok"**
- Install ngrok: `brew install ngrok` or https://ngrok.com/download
- Verify it's in PATH: `which ngrok`

**Session doesn't open**
- Verify the session exists and is active
- Check that the session ID is correct
## Managing Tunnels

### List Running Tunnels

To see all active tunnels with their IDs and URLs:

```bash
node ~/.config/opencode/skills/opencode-tunnel/tunnel.js list
```

This shows:
- Tunnel ID (used for stopping)
- Status (running/stopped)
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
- Requires ngrok account (free tier works)
- Tunnel URL changes each time it's restarted
- Only exposes the currently running session
- Local machine must stay online
