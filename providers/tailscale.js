/**
 * Tailscale Tunnel Provider
 *
 * Uses Tailscale Serve to expose local services to your tailnet.
 * Requires tailscale to be installed and configured.
 */

const { spawn, execSync } = require("node:child_process");
const { TunnelProvider, registerProvider } = require("./index");

class TailscaleProvider extends TunnelProvider {
	constructor() {
		super("tailscale");
	}

	isAvailable() {
		try {
			execSync("which tailscale", { stdio: "ignore" });
			return true;
		} catch (_e) {
			return false;
		}
	}

	getVersion() {
		try {
			const version = execSync("tailscale version", {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			});
			return version.split("\n")[0].trim();
		} catch (_e) {
			return "unknown";
		}
	}

	/**
	 * Get the tailscale hostname for constructing URLs
	 */
	_getHostname() {
		try {
			const status = execSync("tailscale status --json", {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			});
			const data = JSON.parse(status);
			// Self is the current machine
			if (data.Self?.DNSName) {
				// Remove trailing dot from DNS name
				return data.Self.DNSName.replace(/\.$/, "");
			}
		} catch (_e) {}
		return null;
	}

	async startTunnel(port, _password) {
		// Note: Tailscale doesn't use basic auth like ngrok
		// Authentication is handled by tailscale's built-in auth
		// We still accept password param for interface consistency

		const hostname = this._getHostname();
		if (!hostname) {
			throw new Error("Could not determine tailscale hostname. Is tailscale configured?");
		}

		// Start tailscale serve in background mode
		// This exposes the service only to your tailnet (private)
		const tunnelProc = spawn("tailscale", ["serve", "--bg", String(port)], {
			stdio: "ignore",
			detached: true,
		});

		return new Promise((resolve, reject) => {
			tunnelProc.on("error", (err) => reject(err));
			tunnelProc.unref();

			const pid = tunnelProc.pid;
			let attempts = 0;
			const maxAttempts = 30; // 30 * 200ms = 6 seconds max

			// Poll for serve to be active
			const timer = setInterval(() => {
				attempts++;

				try {
					const status = execSync("tailscale serve status --json", {
						encoding: "utf8",
						stdio: ["pipe", "pipe", "ignore"],
					});
					const data = JSON.parse(status);

					// Check if serve is active for this port
					const isActive = this._isPortInServeStatus(data, port);
					if (isActive) {
						clearInterval(timer);
						const url = `https://${hostname}`;
						resolve({ url, pid });
						return;
					}
				} catch (_e) {
					// Serve not ready yet, continue polling
				}

				if (attempts >= maxAttempts) {
					clearInterval(timer);
					try {
						process.kill(pid, "SIGTERM");
					} catch (_e) {}
					reject(new Error("Timeout: Tailscale serve did not start"));
				}
			}, 200); // Poll every 200ms
		});
	}

	/**
	 * Check if the port is being served by tailscale serve
	 */
	_isPortInServeStatus(data, targetPort) {
		if (!data) return false;

		// Serve status has Web config directly at root (not in Foreground like funnel)
		if (data.Web) {
			for (const [, webConfig] of Object.entries(data.Web)) {
				if (webConfig.Handlers) {
					for (const [, handler] of Object.entries(webConfig.Handlers)) {
						if (handler.Proxy) {
							const match = handler.Proxy.match(/:(\d+)$/);
							if (match && parseInt(match[1], 10) === targetPort) {
								return true;
							}
						}
					}
				}
			}
		}

		return false;
	}

	async stopTunnel(pid) {
		try {
			// For tailscale serve --bg, we need to reset the serve config
			// Killing the process isn't enough, we need to run serve reset
			execSync("tailscale serve reset", { stdio: "ignore" });
			// Also try to kill the process if it's still running
			process.kill(pid, "SIGTERM");
		} catch (_e) {
			// Process already dead or serve not running
		}
	}

	async checkHealth(_tunnelUrl) {
		try {
			const status = execSync("tailscale serve status --json", {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			});
			const data = JSON.parse(status);

			// Check if any serve is active (Web or TCP config at root level)
			const hasServe = data && (data.Web || data.TCP);

			if (hasServe) {
				return { healthy: true, state: "active" };
			}
			return { healthy: false, state: "inactive", error: "No active serve" };
		} catch (_e) {
			return {
				healthy: false,
				state: "error",
				error: "Cannot check tailscale serve status",
			};
		}
	}

	getInfo() {
		const baseInfo = super.getInfo();
		const hostname = this._getHostname();
		return {
			...baseInfo,
			hostname: hostname,
			url: hostname ? `https://${hostname}` : null,
		};
	}
}

// Register this provider
const provider = new TailscaleProvider();
registerProvider("tailscale", provider);

module.exports = { TailscaleProvider };
