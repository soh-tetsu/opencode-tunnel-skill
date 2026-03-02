/**
 * Tunnel Provider Interface and Registry
 *
 * Registration pattern for pluggable tunnel providers.
 * Providers register themselves, and the registry manages selection.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TUNNEL_DIR = path.join(os.homedir(), ".config", "opencode", "tunnels");
const PROVIDER_CONFIG_FILE = path.join(TUNNEL_DIR, "provider.json");

// Registry storage
const providers = new Map();

/**
 * Base Tunnel Provider Interface
 * All providers must implement these methods
 */
class TunnelProvider {
	constructor(name) {
		this.name = name;
	}

	/**
	 * Check if the provider's binary is installed and available
	 * @returns {boolean}
	 */
	isAvailable() {
		throw new Error(`Provider ${this.name} must implement isAvailable()`);
	}

	/**
	 * Get the provider's version info
	 * @returns {string}
	 */
	getVersion() {
		throw new Error(`Provider ${this.name} must implement getVersion()`);
	}

	/**
	 * Start a tunnel to the given local port
	 * @param {number} port - Local port to tunnel
	 * @param {string} password - Basic auth password
	 * @returns {Promise<{url: string, pid: number}>}
	 */
	async startTunnel(_port, _password) {
		throw new Error(`Provider ${this.name} must implement startTunnel()`);
	}

	/**
	 * Stop a running tunnel
	 * @param {number} pid - Process ID of the tunnel
	 */
	async stopTunnel(_pid) {
		throw new Error(`Provider ${this.name} must implement stopTunnel()`);
	}

	/**
	 * Check health of a tunnel
	 * @param {string} tunnelUrl - URL of the tunnel
	 * @returns {Promise<{healthy: boolean, state: string, error?: string}>}
	 */
	async checkHealth(_tunnelUrl) {
		throw new Error(`Provider ${this.name} must implement checkHealth()`);
	}

	/**
	 * Get provider display info for UI
	 * @returns {{name: string, available: boolean, version: string}}
	 */
	getInfo() {
		return {
			name: this.name,
			available: this.isAvailable(),
			version: this.isAvailable() ? this.getVersion() : "not installed",
		};
	}
}

/**
 * Register a tunnel provider
 * @param {string} name - Provider identifier
 * @param {TunnelProvider} provider - Provider instance
 */
function registerProvider(name, provider) {
	providers.set(name, provider);
}

/**
 * Get a registered provider by name
 * @param {string} name - Provider name
 * @returns {TunnelProvider | undefined}
 */
function getProvider(name) {
	return providers.get(name);
}

/**
 * Get all registered providers
 * @returns {Map<string, TunnelProvider>}
 */
function getAllProviders() {
	return providers;
}

/**
 * Get available providers (those that are installed)
 * @returns {Array<{name: string, provider: TunnelProvider}>}
 */
function getAvailableProviders() {
	return Array.from(providers.entries())
		.filter(([, provider]) => provider.isAvailable())
		.map(([name, provider]) => ({ name, provider }));
}

/**
 * Load saved provider preference
 * @returns {string | null}
 */
function loadProviderPreference() {
	try {
		if (fs.existsSync(PROVIDER_CONFIG_FILE)) {
			const config = JSON.parse(fs.readFileSync(PROVIDER_CONFIG_FILE, "utf8"));
			return config.provider;
		}
	} catch (_e) {}
	return null;
}

/**
 * Save provider preference
 * @param {string} providerName
 */
function saveProviderPreference(providerName) {
	try {
		if (!fs.existsSync(TUNNEL_DIR)) {
			fs.mkdirSync(TUNNEL_DIR, { recursive: true });
		}
		fs.writeFileSync(
			PROVIDER_CONFIG_FILE,
			JSON.stringify({ provider: providerName, updatedAt: Date.now() }, null, 2),
		);
	} catch (_e) {}
}

/**
 * Get the default provider (last used, or first available)
 * @returns {{name: string, provider: TunnelProvider} | null}
 */
function getDefaultProvider() {
	// Try last used provider first
	const saved = loadProviderPreference();
	if (saved) {
		const provider = getProvider(saved);
		if (provider?.isAvailable()) {
			return { name: saved, provider };
		}
	}

	// Fall back to first available provider
	const available = getAvailableProviders();
	if (available.length > 0) {
		const { name, provider } = available[0];
		saveProviderPreference(name);
		return { name, provider };
	}

	return null;
}

/**
 * Set the default provider
 * @param {string} providerName
 * @returns {boolean} - Success
 */
function setDefaultProvider(providerName) {
	const provider = getProvider(providerName);
	if (!provider) {
		return false;
	}
	if (!provider.isAvailable()) {
		return false;
	}
	saveProviderPreference(providerName);
	return true;
}

module.exports = {
	TunnelProvider,
	registerProvider,
	getProvider,
	getAllProviders,
	getAvailableProviders,
	getDefaultProvider,
	setDefaultProvider,
	loadProviderPreference,
	saveProviderPreference,
};
