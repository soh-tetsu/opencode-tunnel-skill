#!/usr/bin/env node

/**
 * OpenCode Tunnel Skill
 * 
 * Exposes a specific OpenCode session to the public internet via a tunnel.
 * 
 * Usage:
 *   node tunnel.js                    - Create a new tunnel (interactive)
 *   node tunnel.js create             - Create a new tunnel
 *   node tunnel.js list               - List all running tunnels
 *   node tunnel.js stop [tunnel-id]   - Stop a tunnel (or all if no id provided)
 */

const { execSync, spawn } = require('node:child_process');
const http = require('node:http');
const QRCode = require('qrcode');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Platform check - macOS only for now
if (process.platform !== 'darwin') {
  console.error(`[opencode-tunnel] ERROR: This skill currently only supports macOS.`);
  console.error(`[opencode-tunnel]        Detected platform: ${process.platform}`);
  console.error(`[opencode-tunnel]        Linux and Windows support is planned for a future release.`);
  process.exit(1);
}

// Paths
const TUNNEL_DIR = path.join(os.homedir(), '.config', 'opencode', 'tunnels');
const TUNNEL_METADATA_FILE = path.join(TUNNEL_DIR, 'tunnels.json');

// Ensure tunnel directory exists
if (!fs.existsSync(TUNNEL_DIR)) {
  fs.mkdirSync(TUNNEL_DIR, { recursive: true });
}

function log(msg) { console.log(`[opencode-tunnel] ${msg}`); }
function error(msg) { console.error(`[opencode-tunnel] ERROR: ${msg}`); }

// Load tunnel metadata
function loadTunnels() {
  try {
    if (fs.existsSync(TUNNEL_METADATA_FILE)) {
      return JSON.parse(fs.readFileSync(TUNNEL_METADATA_FILE, 'utf8'));
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
function cleanupDeadTunnels() {
  const tunnels = loadTunnels();
  let modified = false;
  
  for (const [id, tunnel] of Object.entries(tunnels)) {
    const tunnelRunning = isProcessRunning(tunnel.tunnelPid);
    // opencodePid may be null if tunneling an existing process
    const opencodeRunning = tunnel.opencodePid ? isProcessRunning(tunnel.opencodePid) : true;
    
    if (!tunnelRunning && !opencodeRunning) {
      delete tunnels[id];
      modified = true;
    } else if (!tunnelRunning) {
      // Tunnel died - kill managed opencode if we own it
      try {
        if (tunnel.opencodePid) process.kill(tunnel.opencodePid, 'SIGTERM');
      } catch (_e) {}
      delete tunnels[id];
      modified = true;
    } else if (tunnel.opencodePid && !opencodeRunning) {
      // Our opencode died but tunnel still up - kill tunnel too
      try {
        process.kill(tunnel.tunnelPid, 'SIGTERM');
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

// List all tunnels
async function listTunnels() {
  const tunnels = cleanupDeadTunnels();
  const tunnelEntries = Object.entries(tunnels);
  
  if (tunnelEntries.length === 0) {
    console.log('\n  No active tunnels found.\n');
    console.log('  Create one with: node tunnel.js create\n');
    return;
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  🌐 ACTIVE TUNNELS');
  console.log('═'.repeat(70));
  
  const sortedEntries = tunnelEntries.sort(([, a], [, b]) => a.createdAt - b.createdAt);
  for (const [id, tunnel] of sortedEntries) {
    const tunnelOk = isProcessRunning(tunnel.tunnelPid);
    const opencodeOk = tunnel.opencodePid ? isProcessRunning(tunnel.opencodePid) : true;
    const status = (tunnelOk && opencodeOk) ? '🟢 RUNNING' : '🔴 DEAD';
    const createdLabel = new Date(tunnel.createdAt).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`\n  Tunnel ID:    ${id}  (created ${createdLabel})`);
    console.log(`  Status:       ${status}`);
    console.log(`  URL:          ${tunnel.url}`);
    console.log(`  Login:        ${tunnel.password ? `opencode / ${tunnel.password}  🔐` : '(no auth - existing opencode)'}` );
    console.log(`  Session:      ${tunnel.sessionTitle}`);
    console.log(`  Project:      ${tunnel.projectPath}`);
    console.log(`  Local Port:   ${tunnel.localPort}`);
    console.log('─'.repeat(70));
  }
  
  console.log('\n  Commands:');
  console.log('    node tunnel.js stop [tunnel-id]  - Stop a specific tunnel');
  console.log('    node tunnel.js stop              - Stop all tunnels\n');
}

// Stop tunnel(s)
async function stopTunnel(tunnelId) {
  const tunnels = loadTunnels();
  
  if (tunnelId) {
    // Stop specific tunnel
    const tunnel = tunnels[tunnelId];
    if (!tunnel) {
      error(`Tunnel ${tunnelId} not found`);
      process.exit(1);
    }
    
    console.log(`\n  Stopping tunnel ${tunnelId}...`);
    
    try {
      if (isProcessRunning(tunnel.tunnelPid)) {
        process.kill(tunnel.tunnelPid, 'SIGTERM');
        log(`Killed tunnel process (PID: ${tunnel.tunnelPid})`);
      }
    } catch (_e) {}
    
    try {
      if (isProcessRunning(tunnel.opencodePid)) {
        process.kill(tunnel.opencodePid, 'SIGTERM');
        log(`Killed opencode server (PID: ${tunnel.opencodePid})`);
      }
    } catch (_e) {}
    
    delete tunnels[tunnelId];
    saveTunnels(tunnels);
    
    console.log('  ✅ Tunnel stopped successfully\n');
  } else {
    // Stop all tunnels
    const tunnelIds = Object.keys(tunnels);
    
    if (tunnelIds.length === 0) {
      console.log('\n  No active tunnels to stop.\n');
      return;
    }
    
    console.log(`\n  Stopping ${tunnelIds.length} tunnel(s)...\n`);
    
    for (const id of tunnelIds) {
      const tunnel = tunnels[id];
      console.log(`  Stopping ${id}...`);
      
      try {
        if (isProcessRunning(tunnel.tunnelPid)) {
          process.kill(tunnel.tunnelPid, 'SIGTERM');
        }
      } catch (_e) {}
      
      try {
        if (isProcessRunning(tunnel.opencodePid)) {
          process.kill(tunnel.opencodePid, 'SIGTERM');
        }
      } catch (_e) {}
      
      delete tunnels[id];
    }
    
    saveTunnels(tunnels);
    console.log('\n  ✅ All tunnels stopped successfully\n');
  }
}

// Discover running OpenCode server
async function discoverPort() {
  log('Discovering OpenCode server...');
  
  const ports = [3333, 4096];
  
  for (const port of ports) {
    try {
      const result = await new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/global/health`, (res) => {
          resolve(res.statusCode === 200 ? port : null);
        });
        req.on('error', () => resolve(null));
        req.end();
      });
      if (result) {
        log(`Found OpenCode on port ${result}`);
        return result;
      }
    } catch (_e) {}
  }
  
  try {
    const out = execSync('lsof -i -P 2>/dev/null | grep -E "\\.opencode|opencode" | grep LISTEN', { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/:(\d+)\s*\(LISTEN\)/);
    if (m) { log(`Found on port ${m[1]}`); return parseInt(m[1], 10); }
  } catch (_e) {}
  
  return null;
}

// Get current project ID
function getProject(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/project/current`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d).id); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Get current session
async function getSession(port, projectId) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/session`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try {
          const sessions = JSON.parse(d);
          const filtered = projectId ? sessions.filter(s => s.projectID === projectId) : sessions;
          if (!filtered.length) { resolve(null); return; }
          filtered.sort((a, b) => b.time.updated - a.time.updated);
          resolve(filtered[0]);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Get path info
function getPathInfo(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/path`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Build web URL
function buildWebUrl(sessionDir, sessionId) {
  const base64Dir = Buffer.from(sessionDir).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
  return `/${base64Dir}/session/${sessionId}`;
}

// Start tunnel - fully detached, writes JSON logs to a logfile
// Returns { url, pid } after extracting the URL from the log
function startTunnel(port, logPath, password) {
  return new Promise((resolve, reject) => {
    log('Starting tunnel...');
    
    // Fully detach: write JSON logs to file, no stdio pipes
    const tunnelProc = spawn('ngrok', [
      'http', String(port),
      '--basic-auth', `opencode:${password}`,
      '--log', logPath,
      '--log-format', 'json'
    ], {
      stdio: 'ignore',
      detached: true
    });
    tunnelProc.on('error', (err) => reject(err));
    tunnelProc.unref();
    
    const pid = tunnelProc.pid;
    let attempts = 0;
    const maxAttempts = 30;
    
    // Poll logfile for the 'started tunnel' JSON event containing the URL
    const timer = setInterval(() => {
      attempts++;
      try {
        const logContent = fs.readFileSync(logPath, 'utf8');
        // Look for the started tunnel event with url field
        const m = logContent.match(/"url":"(https:\/\/[^"]+)"/);
        if (m) {
          clearInterval(timer);
          const url = m[1];
          log(`Tunnel ready: ${url} (PID: ${pid})`);
          resolve({ url, pid });
          return;
        }
      } catch (_e) {}
      
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        try { process.kill(pid, 'SIGTERM'); } catch (_e) {}
        reject(new Error('Timeout: could not extract tunnel URL from log'));
      }
    }, 1000);
  });
}

// Generate QR as image file
function generateQRImage(url, filePath) {
  return new Promise((resolve, reject) => { 
    QRCode.toFile(filePath, url, { type: 'png', width: 400, margin: 2 }, (err) => err ? reject(err) : resolve()); 
  });
}

// Show QR in terminal - LARGE size
function generateQRTerminal(url) {
  return new Promise((resolve, reject) => { 
    QRCode.toString(url, { type: 'utf8', small: false }, (err, qr) => err ? reject(err) : resolve(qr)); 
  });
}

// Create new tunnel
async function createTunnel() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  🚀 OpenCode Tunnel Skill');
  console.log('  Expose your session to the internet via tunnel');
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    const port = await discoverPort();
    if (!port) { error('No OpenCode server found'); process.exit(1); }
    
    const projectId = await getProject(port);
    log(`Project: ${projectId}`);
    
    const session = await getSession(port, projectId);
    if (!session) { error('No active session'); process.exit(1); }
    const sessionId = session.id;
    const sessionTitle = session.title || session.id;
    log(`Session: ${sessionTitle}`);
    
    const pathInfo = await getPathInfo(port);
    const sessionDir = session.directory || pathInfo.directory;
    log(`Session directory: ${sessionDir}`);
    
    // Tunnel the existing opencode port directly - no separate process needed
    // This allows full read/write access (not read-only) from the browser
    log(`Tunneling existing opencode on port ${port}...`);
    
    const tunnelId = generateTunnelId();
    const password = generatePassword();
    const logPath = path.join(TUNNEL_DIR, `${tunnelId}.cf.log`);
    const { url: tunnelUrl, pid: tunnelPid } = await startTunnel(port, logPath, password);
    
    const urlPath = buildWebUrl(sessionDir, sessionId);
    const fullUrl = tunnelUrl + urlPath;
    const qrPath = path.join(TUNNEL_DIR, `${tunnelId}.png`);
    
    // Generate QR code
    await generateQRImage(fullUrl, qrPath);
    
    // Save tunnel metadata (no opencodePid - using existing process)
    const tunnels = loadTunnels();
    tunnels[tunnelId] = {
      id: tunnelId,
      url: fullUrl,
      tunnelUrl: tunnelUrl,
      localPort: port,
      opencodePid: null,  // existing opencode - not managed by us
      tunnelPid: tunnelPid,
      sessionId: sessionId,
      sessionTitle: sessionTitle,
      projectId: projectId,
      projectPath: sessionDir,
      qrPath: qrPath,
      password: password,
      createdAt: Date.now()
    };
    saveTunnels(tunnels);
    
    // Verify save worked
    const verifyTunnels = loadTunnels();
    if (!verifyTunnels[tunnelId]) {
      error('Failed to save tunnel metadata!');
      process.exit(1);
    }
    log(`Tunnel metadata saved: ${tunnelId}`);
    
    // Display results
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  🌐 TUNNEL READY');
    console.log('─'.repeat(60));
    console.log(`\n  Tunnel ID:    ${tunnelId}`);
    console.log(`  URL:          ${fullUrl}`);
    console.log(`  Login:        opencode / ${password}  🔐`);
    console.log(`  Session:      ${sessionTitle}`);
    console.log(`  Session ID:   ${sessionId}`);
    console.log(`\n${'='.repeat(60)}`);
    console.log('  📱 SCAN THIS QR CODE WITH YOUR PHONE CAMERA');
    console.log('='.repeat(60));
    
    const terminalQR = await generateQRTerminal(fullUrl);
    console.log(`\n${terminalQR}`);
    console.log(`\n${'='.repeat(60)}`);
    console.log('  👆 POINT YOUR PHONE CAMERA AT THE QR CODE ABOVE');
    console.log('  🖼️  QR code also opened in Preview for scanning');
    console.log(`  📋 URL: ${fullUrl}`);
    console.log('='.repeat(60));
    
    console.log('\n  ✅ Tunnel is running in background');
    console.log(`     Tunneling existing opencode on port ${port} (tunnel PID: ${tunnelPid})`);
    console.log('\n  Commands:');
    console.log('     node tunnel.js list              - List all tunnels');
    console.log(`     node tunnel.js stop ${tunnelId}  - Stop this tunnel\n`);
    
    // Open QR in Preview
    try {
      execSync(`open "${qrPath}"`);
    } catch (_e) {}
    
    // Both child processes are fully detached (unref'd) before this point.
    // process.exit(0) is safe - it won't kill detached children.
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
    case 'list':
    case 'ls':
      await listTunnels();
      break;
      
    case 'stop':
    case 'kill':
      await stopTunnel(process.argv[3]);
      break;
      
    case 'create':
    case 'new':
      await createTunnel();
      break;
      
    case 'help':
    case '--help':
    case '-h':
      console.log(`
  OpenCode Tunnel Skill
  
  Usage:
    node tunnel.js                    Create a new tunnel (interactive)
    node tunnel.js create             Create a new tunnel
    node tunnel.js list               List all running tunnels  
    node tunnel.js stop [tunnel-id]   Stop a tunnel (or all if no id)
    node tunnel.js help               Show this help
  
  Examples:
    node tunnel.js create
    node tunnel.js list
    node tunnel.js stop tun_1234567890_abc123
    node tunnel.js stop               Stop all tunnels
    `);
      break;

    default:
      if (!command) {
        // No command - interactive mode
        const readline = require('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('\nCreate a new tunnel? [Y/n]: ', (answer) => {
          rl.close();
          const normalized = answer.trim().toLowerCase();
          if (normalized === '' || normalized === 'y' || normalized === 'yes') {
            createTunnel();
          } else {
            console.log('Cancelled.\n');
            process.exit(0);
          }
        });
      } else {
        error(`Unknown command: ${command}`);
        console.log('  Run: node tunnel.js help\n');
        process.exit(1);
      }
  }
}

main();
