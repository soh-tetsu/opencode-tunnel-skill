#!/usr/bin/env node

/**
 * OpenCode Tunnel Skill
 *
 * Exposes a specific OpenCode session to the public internet via a tunnel.
 * Supports multiple providers: ngrok, tailscale
 *
 * Usage:
 *   node tunnel.js                    - Create a new tunnel (interactive)
 *   node tunnel.js create             - Create a new tunnel
 *   node tunnel.js provider           - Show current provider
 *   node tunnel.js provider ngrok     - Switch to ngrok provider
 *   node tunnel.js provider tailscale - Switch to tailscale provider
 *   node tunnel.js list               - List all running tunnels
 *   node tunnel.js stop [tunnel-id]   - Stop a tunnel (or all if no id provided)
 */

const { execSync } = require("node:child_process");
const http = require("node:http");
const QRCode = require("qrcode");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Load providers (this registers them)
require("./providers/ngrok");
require("./providers/tailscale");
const {
	getDefaultProvider,
	setDefaultProvider,
	getAllProviders,
	getAvailableProviders,
	loadProviderPreference,
} = require("./providers");

// Platform check - macOS only for now
if (process.platform !== "darwin") {
	console.error(`[opencode-tunnel] ERROR: This skill currently only supports macOS.`);
	console.error(`[opencode-tunnel]        Detected platform: ${process.platform}`);
	console.error(
		`[opencode-tunnel]        Linux and Windows support is planned for a future release.`,
	);
	process.exit(1);
}

// Paths
const TUNNEL_DIR = path.join(os.homedir(), ".config", "opencode", "tunnels");
const TUNNEL_METADATA_FILE = path.join(TUNNEL_DIR, "tunnels.json");
const LOG_DIR = "/tmp/opencode-tunnel";

// Ensure tunnel directory exists
if (!fs.existsSync(TUNNEL_DIR)) {
	fs.mkdirSync(TUNNEL_DIR, { recursive: true });
}

function log(msg) {
	console.log(`[opencode-tunnel] ${msg}`);
}
function error(msg) {
	console.error(`[opencode-tunnel] ERROR: ${msg}`);
}

// Load tunnel metadata
function loadTunnels() {
	try {
		if (fs.existsSync(TUNNEL_METADATA_FILE)) {
			return JSON.parse(fs.readFileSync(TUNNEL_METADATA_FILE, "utf8"));
		}
	} catch (_e) {}
	return {};
}

// Save tunnel metadata
function saveTunnels(tunnels) {
	fs.writeFileSync(TUNNEL_METADATA_FILE, JSON.stringify(tunnels, null, 2));
}

// Generate unique tunnel ID
function generateTunnelId() {
	return `tun_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate 8-digit numeric password (min 8 chars required by tunnel provider)
function generatePassword() {
	return String(Math.floor(10000000 + Math.random() * 90000000));
}

// Check if process is running
function isProcessRunning(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (_e) {
		return false;
	}
}

// Cleanup dead tunnels
async function cleanupDeadTunnels() {
	const tunnels = loadTunnels();
	let modified = false;

	for (const [id, tunnel] of Object.entries(tunnels)) {
		// Provider-specific tunnel checking
		let tunnelRunning = false;
		if (tunnel.provider === "tailscale") {
			// For tailscale, check serve status instead of process
			const { provider } = getDefaultProvider() || {};
			if (provider) {
				const health = await provider.checkHealth(tunnel.tunnelUrl);
				tunnelRunning = health.healthy;
			}
		} else {
			// For ngrok and others, check process
			tunnelRunning = isProcessRunning(tunnel.tunnelPid);
		}

		const opencodeRunning = tunnel.opencodePid ? isProcessRunning(tunnel.opencodePid) : true;

		if (!tunnelRunning && !opencodeRunning) {
			delete tunnels[id];
			modified = true;
		} else if (!tunnelRunning) {
			// Tunnel died but opencode still running - clean up
			if (tunnel.provider === "tailscale") {
				// For tailscale, reset serve config
				try {
					execSync("tailscale serve reset", { stdio: "ignore" });
				} catch (_e) {}
			}
			delete tunnels[id];
			modified = true;
		} else if (tunnel.opencodePid && !opencodeRunning) {
			// Our opencode died - stop tunnel too
			try {
				if (tunnel.provider === "tailscale") {
					execSync("tailscale serve reset", { stdio: "ignore" });
				} else {
					process.kill(tunnel.tunnelPid, "SIGTERM");
				}
			} catch (_e) {}
			delete tunnels[id];
			modified = true;
		}
	}

	if (modified) {
		saveTunnels(tunnels);
	}

	return tunnels;
}

// Check tunnel health via provider
async function checkTunnelHealth(provider, tunnelUrl) {
	return provider.checkHealth(tunnelUrl);
}

// List all tunnels
async function listTunnels() {
	const tunnels = await cleanupDeadTunnels();
	const tunnelEntries = Object.entries(tunnels);

	if (tunnelEntries.length === 0) {
		console.log("\n  No active tunnels found.\n");
		console.log("  Create one with: node tunnel.js create\n");
		return;
	}

	console.log(`\n${"═".repeat(70)}`);
	console.log("  🌐 ACTIVE TUNNELS");
	console.log("═".repeat(70));

	const sortedEntries = tunnelEntries.sort(([, a], [, b]) => a.createdAt - b.createdAt);

	for (const [id, tunnel] of sortedEntries) {
		// Provider-specific tunnel status check
		let tunnelOk = false;
		if (tunnel.provider === "tailscale") {
			const { provider } = getDefaultProvider() || {};
			if (provider) {
				const health = await provider.checkHealth(tunnel.tunnelUrl);
				tunnelOk = health.healthy;
			}
		} else {
			tunnelOk = isProcessRunning(tunnel.tunnelPid);
		}

		const opencodeOk = tunnel.opencodePid ? isProcessRunning(tunnel.opencodePid) : true;
		const createdLabel = new Date(tunnel.createdAt).toISOString().replace("T", " ").slice(0, 19);

		// Get provider for health check
		const { provider } = getDefaultProvider() || {};
		let healthStatus = null;
		if (tunnelOk && provider) {
			healthStatus = await checkTunnelHealth(provider, tunnel.tunnelUrl);
		}

		const processStatus = tunnelOk && opencodeOk ? "🟢" : "🔴";
		const tunnelHealth = !tunnelOk
			? "dead"
			: !healthStatus
				? "unknown"
				: healthStatus.healthy
					? healthStatus.state
					: healthStatus.state;

		const status = `${processStatus} ${tunnelHealth.toUpperCase()}`;
		const healthDetail = healthStatus && !healthStatus.healthy ? ` (${healthStatus.error})` : "";

		console.log(`\n  Tunnel ID:    ${id}  (created ${createdLabel})`);
		console.log(`  Status:       ${status}${healthDetail}`);
		console.log(`  URL:          ${tunnel.url}`);
		if (tunnel.provider === "tailscale") {
			console.log(`  Auth:         Tailscale SSO - Install Tailscale on your device to access`);
			console.log(`  How to:       https://tailscale.com/download`);
		} else {
			console.log(`  Login:        opencode / ${tunnel.password}  🔐`);
		}
		console.log(`  Provider:     ${tunnel.provider || "ngrok"}`);
		console.log(`  Session:      ${tunnel.sessionTitle}`);
		console.log(`  Project:      ${tunnel.projectPath}`);
		console.log(`  Local Port:   ${tunnel.localPort}`);
		console.log("─".repeat(70));
	}

	console.log("\n  Commands:");
	console.log("    node tunnel.js stop [tunnel-id]  - Stop a specific tunnel");
	console.log("    node tunnel.js stop              - Stop all tunnels\n");
}

// Stop tunnel(s)
async function stopTunnel(tunnelId) {
	const tunnels = loadTunnels();

	if (tunnelId) {
		const tunnel = tunnels[tunnelId];
		if (!tunnel) {
			error(`Tunnel ${tunnelId} not found`);
			process.exit(1);
		}

		console.log(`\n  Stopping tunnel ${tunnelId}...`);

		// Get provider to stop tunnel properly
		const { provider } = getDefaultProvider() || {};
		if (provider) {
			await provider.stopTunnel(tunnel.tunnelPid);
			log(`Stopped via ${provider.name} provider`);
		} else {
			// Fallback: just kill the process
			try {
				if (isProcessRunning(tunnel.tunnelPid)) {
					process.kill(tunnel.tunnelPid, "SIGTERM");
					log(`Killed tunnel process (PID: ${tunnel.tunnelPid})`);
				}
			} catch (_e) {}
		}

		try {
			if (isProcessRunning(tunnel.opencodePid)) {
				process.kill(tunnel.opencodePid, "SIGTERM");
				log(`Killed opencode server (PID: ${tunnel.opencodePid})`);
			}
		} catch (_e) {}

		delete tunnels[tunnelId];
		saveTunnels(tunnels);

		console.log("  ✅ Tunnel stopped successfully\n");
	} else {
		const tunnelIds = Object.keys(tunnels);

		if (tunnelIds.length === 0) {
			console.log("\n  No active tunnels to stop.\n");
			return;
		}

		console.log(`\n  Stopping ${tunnelIds.length} tunnel(s)...\n`);

		const { provider } = getDefaultProvider() || {};

		for (const id of tunnelIds) {
			const tunnel = tunnels[id];
			console.log(`  Stopping ${id}...`);

			if (provider) {
				await provider.stopTunnel(tunnel.tunnelPid);
			} else {
				try {
					if (isProcessRunning(tunnel.tunnelPid)) {
						process.kill(tunnel.tunnelPid, "SIGTERM");
					}
				} catch (_e) {}
			}

			try {
				if (isProcessRunning(tunnel.opencodePid)) {
					process.kill(tunnel.opencodePid, "SIGTERM");
				}
			} catch (_e) {}

			delete tunnels[id];
		}

		saveTunnels(tunnels);
		console.log("\n  ✅ All tunnels stopped successfully\n");
	}
}

// Discover running OpenCode server via lsof
async function discoverPort() {
	log("Discovering OpenCode server...");

	try {
		const out = execSync('lsof -i -P 2>/dev/null | grep -E ".opencode|opencode" | grep LISTEN', {
			encoding: "utf8",
			timeout: 5000,
		});
		const m = out.match(/:(\d+)\s*\(LISTEN\)/);
		if (m) {
			log(`Found OpenCode on port ${m[1]}`);
			return parseInt(m[1], 10);
		}
	} catch (_e) {}

	return null;
}

// Get current project ID
function getProject(port) {
	return new Promise((resolve, reject) => {
		http
			.get(`http://localhost:${port}/project/current`, (res) => {
				let d = "";
				res.on("data", (c) => (d += c));
				res.on("end", () => {
					try {
						resolve(JSON.parse(d).id);
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

// Get current session
async function getSession(port, projectId) {
	return new Promise((resolve, reject) => {
		http
			.get(`http://localhost:${port}/session`, (res) => {
				let d = "";
				res.on("data", (c) => (d += c));
				res.on("end", () => {
					try {
						const sessions = JSON.parse(d);
						const filtered = projectId
							? sessions.filter((s) => s.projectID === projectId)
							: sessions;
						if (!filtered.length) {
							resolve(null);
							return;
						}
						filtered.sort((a, b) => b.time.updated - a.time.updated);
						resolve(filtered[0]);
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

// Get path info
function getPathInfo(port) {
	return new Promise((resolve, reject) => {
		http
			.get(`http://localhost:${port}/path`, (res) => {
				let d = "";
				res.on("data", (c) => (d += c));
				res.on("end", () => {
					try {
						resolve(JSON.parse(d));
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

// Build web URL
function buildWebUrl(sessionDir, sessionId) {
	const base64Dir = Buffer.from(sessionDir)
		.toString("base64")
		.replace(/\//g, "_")
		.replace(/\+/g, "-");
	return `/${base64Dir}/session/${sessionId}`;
}

// Generate QR as image file
function generateQRImage(url, filePath) {
	return new Promise((resolve, reject) => {
		QRCode.toFile(filePath, url, { type: "png", width: 400, margin: 2 }, (err) =>
			err ? reject(err) : resolve(),
		);
	});
}

// Show QR in terminal - LARGE size
function generateQRTerminal(url) {
	return new Promise((resolve, reject) => {
		QRCode.toString(url, { type: "utf8", small: false }, (err, qr) =>
			err ? reject(err) : resolve(qr),
		);
	});
}

// Provider management
async function showProvider() {
	const current = loadProviderPreference();
	const _available = getAvailableProviders();

	console.log(`\n${"═".repeat(60)}`);
	console.log("  🔌 TUNNEL PROVIDERS");
	console.log("═".repeat(60));

	console.log("\n  Available providers:");
	for (const [name, provider] of getAllProviders()) {
		const info = provider.getInfo();
		const marker = name === current ? "👉" : "  ";
		const status = info.available ? "✅" : "❌";
		console.log(`    ${marker} ${name.padEnd(12)} ${status} ${info.version}`);
	}

	console.log("\n  Current default:");
	if (current) {
		console.log(`    ${current}`);
	} else {
		console.log("    (none - will auto-select first available)");
	}

	console.log("\n  Commands:");
	console.log("    node tunnel.js provider ngrok     - Use ngrok");
	console.log("    node tunnel.js provider tailscale - Use tailscale");
	console.log("═".repeat(60));
	console.log();
}

async function setProvider(providerName) {
	const allProviders = getAllProviders();

	if (!allProviders.has(providerName)) {
		error(`Unknown provider: ${providerName}`);
		console.log("\n  Available providers:");
		for (const [name] of allProviders) {
			console.log(`    - ${name}`);
		}
		console.log();
		process.exit(1);
	}

	const provider = allProviders.get(providerName);
	if (!provider.isAvailable()) {
		error(`${providerName} is not installed or not available`);
		console.log(`\n  Install ${providerName} first:`);
		if (providerName === "ngrok") {
			console.log("    brew install ngrok");
		} else if (providerName === "tailscale") {
			console.log("    brew install tailscale");
		}
		console.log();
		process.exit(1);
	}

	if (setDefaultProvider(providerName)) {
		console.log(`\n  ✅ Default provider set to: ${providerName}\n`);
	} else {
		error(`Failed to set provider: ${providerName}`);
		process.exit(1);
	}
}

// Create new tunnel
async function createTunnel() {
	console.log(`\n${"=".repeat(60)}`);
	console.log("  🚀 OpenCode Tunnel Skill");
	console.log("  Expose your session to the internet via tunnel");
	console.log(`${"=".repeat(60)}\n`);

	// Get provider
	let providerResult = getDefaultProvider();
	if (!providerResult) {
		const available = getAvailableProviders();
		if (available.length === 0) {
			error("No tunnel providers available");
			console.log("\n  Please install one of:");
			console.log("    - ngrok: brew install ngrok");
			console.log("    - tailscale: brew install tailscale");
			console.log();
			process.exit(1);
		}
		// Auto-select first available
		providerResult = available[0];
	}

	const { name: providerName, provider } = providerResult;
	log(`Using provider: ${providerName}`);

	try {
		const port = await discoverPort();
		if (!port) {
			error("No OpenCode server found");
			process.exit(1);
		}

		const projectId = await getProject(port);
		log(`Project: ${projectId}`);

		const session = await getSession(port, projectId);
		if (!session) {
			error("No active session");
			process.exit(1);
		}
		const sessionId = session.id;
		const sessionTitle = session.title || session.id;
		log(`Session: ${sessionTitle}`);

		const pathInfo = await getPathInfo(port);
		const sessionDir = session.directory || pathInfo.directory;
		log(`Session directory: ${sessionDir}`);

		log(`Tunneling existing opencode on port ${port}...`);

		const tunnelId = generateTunnelId();
		const password = generatePassword();

		// Start tunnel via provider
		const { url: tunnelUrl, pid: tunnelPid } = await provider.startTunnel(port, password);

		const urlPath = buildWebUrl(sessionDir, sessionId);
		const fullUrl = tunnelUrl + urlPath;
		const qrPath = path.join(LOG_DIR, `${tunnelId}.png`);

		// Generate QR code
		await generateQRImage(fullUrl, qrPath);

		// Save tunnel metadata
		const tunnels = loadTunnels();
		tunnels[tunnelId] = {
			id: tunnelId,
			url: fullUrl,
			tunnelUrl: tunnelUrl,
			localPort: port,
			opencodePid: null,
			tunnelPid: tunnelPid,
			sessionId: sessionId,
			sessionTitle: sessionTitle,
			projectId: projectId,
			projectPath: sessionDir,
			qrPath: qrPath,
			password: providerName === "ngrok" ? password : null,
			provider: providerName,
			createdAt: Date.now(),
		};
		saveTunnels(tunnels);

		// Verify save worked
		const verifyTunnels = loadTunnels();
		if (!verifyTunnels[tunnelId]) {
			error("Failed to save tunnel metadata!");
			process.exit(1);
		}
		log(`Tunnel metadata saved: ${tunnelId}`);

		// Display results
		console.log(`\n${"─".repeat(60)}`);
		console.log("  🌐 TUNNEL READY");
		console.log("─".repeat(60));
		console.log(`\n  Provider:     ${providerName}`);
		console.log(`  Tunnel ID:    ${tunnelId}`);
		console.log(`  URL:          ${fullUrl}`);
		if (providerName === "ngrok") {
			console.log(`  Login:        opencode / ${password}  🔐`);
		} else {
			console.log(`  Auth:         Tailscale SSO (no password needed)`);
			console.log(
				`  Setup:        Install Tailscale on your device → https://tailscale.com/download`,
			);
			console.log(`                Then sign in to your tailnet to access this URL`);
		}
		console.log(`  Session ID:   ${sessionId}`);
		console.log(`\n${"=".repeat(60)}`);
		console.log("  📱 SCAN THIS QR CODE WITH YOUR PHONE CAMERA");
		console.log("=".repeat(60));

		const terminalQR = await generateQRTerminal(fullUrl);
		console.log(`\n${terminalQR}`);
		console.log(`\n${"=".repeat(60)}`);
		console.log("  👆 POINT YOUR PHONE CAMERA AT THE QR CODE ABOVE");
		console.log("  🖼️  QR code also opened in Preview for scanning");
		console.log(`  📋 URL: ${fullUrl}`);
		console.log("=".repeat(60));

		console.log("\n  ✅ Tunnel is running in background");
		console.log(`     Tunneling existing opencode on port ${port} (tunnel PID: ${tunnelPid})`);
		console.log("\n  Commands:");
		console.log("     node tunnel.js list              - List all tunnels");
		console.log(`     node tunnel.js stop ${tunnelId}  - Stop this tunnel\n`);

		// Open QR in Preview
		try {
			execSync(`open "${qrPath}"`);
		} catch (_e) {}

		process.exit(0);
	} catch (err) {
		error(err.message);
		process.exit(1);
	}
}

// Main
async function main() {
	const command = process.argv[2];

	switch (command) {
		case "list":
		case "ls":
			await listTunnels();
			break;

		case "stop":
		case "kill":
			await stopTunnel(process.argv[3]);
			break;

		case "create":
		case "new":
			await createTunnel();
			break;

		case "provider": {
			const providerName = process.argv[3];
			if (providerName) {
				await setProvider(providerName);
			} else {
				await showProvider();
			}
			break;
		}

		case "help":
		case "--help":
		case "-h":
			console.log(`
  OpenCode Tunnel Skill
  
  Usage:
    node tunnel.js                    Create a new tunnel (interactive)
    node tunnel.js create             Create a new tunnel
    node tunnel.js provider           Show current provider
    node tunnel.js provider ngrok     Switch to ngrok provider
    node tunnel.js provider tailscale Switch to tailscale provider
    node tunnel.js list               List all running tunnels  
    node tunnel.js stop [tunnel-id]   Stop a tunnel (or all if no id)
    node tunnel.js help               Show this help
  
  Examples:
    node tunnel.js create
    node tunnel.js list
    node tunnel.js provider tailscale
    node tunnel.js stop tun_1234567890_abc123
    node tunnel.js stop               Stop all tunnels
    `);
			break;

		default:
			if (!command) {
				// No command - interactive mode
				const readline = require("node:readline");
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout,
				});
				rl.question("\nCreate a new tunnel? [Y/n]: ", (answer) => {
					rl.close();
					const normalized = answer.trim().toLowerCase();
					if (normalized === "" || normalized === "y" || normalized === "yes") {
						createTunnel();
					} else {
						console.log("Cancelled.\n");
						process.exit(0);
					}
				});
			} else {
				error(`Unknown command: ${command}`);
				console.log("  Run: node tunnel.js help\n");
				process.exit(1);
			}
	}
}

main();
