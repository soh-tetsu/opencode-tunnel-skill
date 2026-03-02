/**
 * Ngrok Tunnel Provider
 */

const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { TunnelProvider, registerProvider } = require("./index");

const LOG_DIR = "/tmp/opencode-tunnel";

class NgrokProvider extends TunnelProvider {
	constructor() {
		super("ngrok");
	}

	isAvailable() {
		try {
			execSync("which ngrok", { stdio: "ignore" });
			return true;
		} catch (_e) {
			return false;
		}
	}

	getVersion() {
		try {
			const version = execSync("ngrok --version", {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			});
			return version.trim();
		} catch (_e) {
			return "unknown";
		}
	}

	async startTunnel(port, password) {
		// Ensure log directory exists
		if (!fs.existsSync(LOG_DIR)) {
			fs.mkdirSync(LOG_DIR, { recursive: true });
		}
		const logFile = path.join(LOG_DIR, `ngrok-${Date.now()}.log`);

		// Spawn ngrok with logging enabled
		const tunnelProc = spawn(
			"ngrok",
			[
				"http",
				String(port),
				"--basic-auth",
				`opencode:${password}`,
				"--log",
				logFile,
				"--log-format",
				"json",
			],
			{
				stdio: "ignore",
				detached: true,
			},
		);

		return new Promise((resolve, reject) => {
			tunnelProc.on("error", (err) => reject(err));
			tunnelProc.unref();

			const pid = tunnelProc.pid;
			let attempts = 0;
			const maxAttempts = 60; // 60 * 100ms = 6 seconds max

			// Poll ngrok API for tunnel URL
			const timer = setInterval(() => {
				attempts++;

				http
					.get("http://localhost:4040/api/tunnels", (res) => {
						let data = "";
						res.on("data", (chunk) => (data += chunk));
						res.on("end", () => {
							try {
								const response = JSON.parse(data);
								if (response.tunnels && response.tunnels.length > 0) {
									const tunnel = response.tunnels[0];
									if (tunnel.public_url) {
										clearInterval(timer);
										resolve({ url: tunnel.public_url, pid });
										return;
									}
								}
							} catch (_e) {
								// API not ready yet, continue polling
							}
						});
					})
					.on("error", () => {
						// API endpoint not ready yet, continue polling
					});

				if (attempts >= maxAttempts) {
					clearInterval(timer);
					try {
						process.kill(pid, "SIGTERM");
					} catch (_e) {}
					reject(new Error("Timeout: ngrok API did not respond with tunnel URL"));
				}
			}, 100); // Poll every 100ms
		});
	}

	async stopTunnel(pid) {
		try {
			process.kill(pid, "SIGTERM");
		} catch (_e) {
			// Process already dead
		}
	}

	async checkHealth(tunnelUrl) {
		return new Promise((resolve) => {
			const req = http.get("http://localhost:4040/api/tunnels", (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						const response = JSON.parse(data);
						if (response.tunnels && response.tunnels.length > 0) {
							const matchingTunnel = response.tunnels.find((t) =>
								tunnelUrl?.includes(t.public_url),
							);
							if (matchingTunnel) {
								resolve({
									healthy: true,
									state: matchingTunnel.state || "active",
								});
							} else {
								resolve({
									healthy: false,
									state: "not_found",
									error: "Tunnel not found in ngrok",
								});
							}
						} else {
							resolve({
								healthy: false,
								state: "no_tunnels",
								error: "No active tunnels in ngrok",
							});
						}
					} catch (_e) {
						resolve({
							healthy: false,
							state: "error",
							error: "Failed to parse ngrok API response",
						});
					}
				});
			});
			req.on("error", () => {
				resolve({
					healthy: false,
					state: "unreachable",
					error: "Cannot connect to ngrok API",
				});
			});
			req.setTimeout(3000, () => {
				req.destroy();
				resolve({
					healthy: false,
					state: "timeout",
					error: "ngrok API timeout",
				});
			});
		});
	}
}

// Register this provider
const provider = new NgrokProvider();
registerProvider("ngrok", provider);

module.exports = { NgrokProvider };
