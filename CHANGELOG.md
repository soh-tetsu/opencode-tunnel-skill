# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-02

### Added
- Password protection: every tunnel gets an auto-generated 6-digit password
- Login credentials (`opencode / <password>`) displayed at creation and in `list`
- Password stored in tunnel metadata so `list` always shows it

### Fixed
- **Critical**: Spawning `opencode serve` (headless) instead of TUI mode — the old command launched a TUI app that immediately exited without a TTY, leaving a dead opencode process
- **Critical**: `stop` now uses raw metadata (not `cleanupDeadTunnels`) so orphaned opencode processes are always killed even when cloudflared has already died
- Health check now accepts HTTP 401 as "server is ready" (password-protected servers return 401, not 200)
- Removed hardcoded personal machine path from binary fallback
- Unknown commands now print an error and exit instead of silently entering interactive mode
- Removed dead code: unused `createdAt` variable, unused `cloudflaredProcess` destructure

### Changed
- Tunnel list shows creation timestamp inline with Tunnel ID, sorted by creation time
- Removed redundant "Created:" field from list output

## [1.0.0] - 2026-03-02

### Added
- Initial release
- Create tunnels with `create` command
- List running tunnels with `list` command
- Stop tunnels with `stop` command
- QR code generation for mobile access (terminal + PNG)
- Support for multiple concurrent tunnels
- Metadata persistence (`~/.config/opencode/tunnels/tunnels.json`)
- Auto-cleanup of dead tunnels on `list`
- Interactive mode when no command specified
- Cloudflare tunnel persistence (detached process, survives parent exit)
