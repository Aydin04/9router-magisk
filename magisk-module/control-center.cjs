// Standalone, Ultra-Lightweight Control Center Web Server (<15MB RAM)
// Runs on a dedicated isolated port (default: 20129) so it never affects or blocks 9router (20128).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 20129;
const DATA_DIR = process.env.DATA_DIR || '/data/adb/9router-data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const CONFIG_FILE = path.join(DATA_DIR, 'router_config.env');
const UI_FLAG = path.join(DATA_DIR, 'enable_ui');
const SYNC_FLAG = path.join(DATA_DIR, 'enable_sync');
const LOG_FLAG = path.join(DATA_DIR, 'enable_internal_logs');
const PID_FILE = path.join(DATA_DIR, '9router.pid');
const LOCKED_RAM_FILE = path.join(DATA_DIR, 'locked_ram_limit');
const SERVICE_LOG = path.join(DATA_DIR, 'service.log');

function loadConfig() {
  const config = {
    CUSTOM_RAM_LIMIT: '300',
    BIND_HOST: '0.0.0.0',
    REQUIRE_AUTH: 'false',
    CUSTOM_API_KEY: 'dsh-local-key',
    CUSTOM_ADMIN_PASSWORD: 'admin'
  };
  if (fs.existsSync(CONFIG_FILE)) {
    const lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) {
        config[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return config;
}

function saveConfig(cfg) {
  let content = '';
  for (const [k, v] of Object.entries(cfg)) {
    content += `${k}=${v}\n`;
  }
  fs.writeFileSync(CONFIG_FILE, content, 'utf8');
}

function getStatus() {
  const config = loadConfig();
  let pid = null;
  let running = false;
  let rssMb = 0;
  let uptimeSec = 0;

  if (fs.existsSync(PID_FILE)) {
    try {
      pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        process.kill(pid, 0); // Check if alive
        running = true;
        // Read RSS from /proc/<pid>/status
        const statusFile = `/proc/${pid}/status`;
        if (fs.existsSync(statusFile)) {
          const s = fs.readFileSync(statusFile, 'utf8');
          const m = s.match(/VmRSS:\s+(\d+)\s+kB/i);
          if (m) rssMb = Math.round(parseInt(m[1], 10) / 1024);
        }
        const stat = fs.statSync(`/proc/${pid}`);
        uptimeSec = Math.round((Date.now() - stat.mtimeMs) / 1000);
      }
    } catch {
      running = false;
    }
  }

  let lockedLimit = null;
  if (fs.existsSync(LOCKED_RAM_FILE)) {
    try {
      lockedLimit = parseInt(fs.readFileSync(LOCKED_RAM_FILE, 'utf8').trim(), 10);
    } catch {}
  }

  return {
    running,
    pid,
    rssMb,
    uptimeSec,
    dashboardActive: fs.existsSync(UI_FLAG),
    syncActive: fs.existsSync(SYNC_FLAG),
    logsActive: fs.existsSync(LOG_FLAG),
    bindHost: config.BIND_HOST || '0.0.0.0',
    requireAuth: config.REQUIRE_AUTH === 'true',
    apiKey: config.CUSTOM_API_KEY || 'dsh-local-key',
    adminPassword: config.CUSTOM_ADMIN_PASSWORD || 'admin',
    ramLimit: parseInt(config.CUSTOM_RAM_LIMIT || '300', 10),
    lockedLimit: lockedLimit || (running ? (rssMb ? rssMb + 40 : null) : null)
  };
}

function reloadService() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (pid) process.kill(pid, 15); // SIGTERM to trigger loop restart in service.sh
    } catch {}
  }
}

function renderHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>9router Control Center</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --card-border: #1f2c47;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --success: #10b981;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 16px; min-height: 100vh; }
    .header { text-align: center; margin-bottom: 20px; padding: 12px; border-bottom: 1px solid var(--card-border); }
    .header h1 { font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .header p { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .card-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 12px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .stat-box { background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; }
    .stat-label { font-size: 12px; color: var(--text-muted); }
    .stat-val { font-size: 16px; font-weight: 700; margin-top: 4px; color: var(--text); }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge-on { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-off { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; }
    .badge-on .badge-dot { background: #10b981; box-shadow: 0 0 8px #10b981; }
    .badge-off .badge-dot { background: #ef4444; }
    
    .item-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .item-row:last-child { border-bottom: none; }
    .item-info { flex: 1; padding-right: 12px; }
    .item-name { font-size: 15px; font-weight: 600; }
    .item-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

    /* Switch toggle */
    .switch { position: relative; display: inline-block; width: 48px; height: 26px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .3s; border-radius: 26px; }
    .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
    input:checked + .slider { background-color: var(--accent); }
    input:checked + .slider:before { transform: translateX(22px); }

    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: 0.2s; }
    .btn-primary { background: var(--accent); color: white; margin-bottom: 8px; }
    .btn-primary:active { background: var(--accent-hover); }
    .btn-outline { background: transparent; border: 1px solid var(--card-border); color: var(--text); margin-bottom: 8px; }
    .btn-danger { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--danger); color: #f87171; }
    .btn-sm { width: auto; padding: 6px 14px; font-size: 13px; }

    .form-group { margin-bottom: 12px; }
    .form-group label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; font-weight: 600; }
    .form-control { width: 100%; background: #0f172a; border: 1px solid var(--card-border); color: var(--text); border-radius: 8px; padding: 10px 12px; font-size: 14px; }
    
    .log-box { background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 11px; max-height: 250px; overflow-y: auto; white-space: pre-wrap; color: #cbd5e1; word-break: break-all; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ 9router Control Center</h1>
    <p>Hardware-Isolated Manager &mdash; Port 20129</p>
  </div>

  <div class="card">
    <div class="card-title">Live Status</div>
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-label">Service Core</div>
        <div class="stat-val" id="stat-service">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">RAM Usage (RSS)</div>
        <div class="stat-val" id="stat-ram">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Dashboard (20128)</div>
        <div class="stat-val" id="stat-dash">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Uptime</div>
        <div class="stat-val" id="stat-uptime">-</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Feature Switches</div>

    <!-- Toggle Dashboard -->
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">Web Dashboard Mode (Next.js Ori)</div>
        <div class="item-desc">ON: Buka Dashboard Full UI (port 20128). OFF: Mode Ultra-Lite hemat RAM (Core AI tetap hidup 24/7).</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="toggle-dash" onchange="toggleFeature('dashboard', this.checked)">
        <span class="slider"></span>
      </label>
    </div>

    <!-- Open Dashboard Link -->
    <div id="dash-link-container" style="display:none; padding-top: 10px;">
      <a href="http://127.0.0.1:20128" target="_blank" class="btn btn-primary">Buka Dashboard Original (20128) &rarr;</a>
    </div>

    <!-- Toggle Sync -->
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">Arena & Model Background Sync</div>
        <div class="item-desc">Sinkronisasi otomatis ranking Arena ELO, pricing, dan katalog model.</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="toggle-sync" onchange="toggleFeature('sync', this.checked)">
        <span class="slider"></span>
      </label>
    </div>

    <!-- Toggle Auth -->
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">API Key & Password Protection</div>
        <div class="item-desc">Wajibkan Authorization Bearer API Key untuk semua chat dan password dashboard.</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="toggle-auth" onchange="toggleFeature('auth', this.checked)">
        <span class="slider"></span>
      </label>
    </div>

    <!-- Toggle Bind Host -->
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">LAN / WiFi Access (0.0.0.0)</div>
        <div class="item-desc">ON: Bisa diakses dari laptop/WiFi. OFF: Khusus localhost 127.0.0.1.</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="toggle-host" onchange="toggleFeature('host', this.checked)">
        <span class="slider"></span>
      </label>
    </div>

    <!-- Toggle Internal Logging -->
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">Internal Router Logging</div>
        <div class="item-desc">ON: Simpan history chat request & database logs. OFF: Silent / hemat storage.</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="toggle-logs" onchange="toggleFeature('logs', this.checked)">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Settings & Credentials</div>
    <div class="form-group">
      <label>Custom API Key</label>
      <input type="text" id="input-key" class="form-control" placeholder="dsh-local-key">
    </div>
    <div class="form-group">
      <label>Dashboard Admin Password</label>
      <input type="text" id="input-pass" class="form-control" placeholder="admin">
    </div>
    <button class="btn btn-primary" onclick="saveSettings()">Simpan Pengaturan</button>
  </div>

  <div class="card">
    <div class="card-title">Service Controls</div>
    <button class="btn btn-outline" onclick="restartService()">⚡ Restart 9router</button>
    <button class="btn btn-outline" onclick="fetchLogs()">📄 Refresh service.log</button>
    <button class="btn btn-danger" onclick="clearLogs()">🗑️ Bersihkan Log & Cache</button>
  </div>

  <div class="card">
    <div class="card-title">Live service.log</div>
    <div class="log-box" id="log-content">Memuat log...</div>
  </div>

  <script>
    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const d = await res.json();
        
        document.getElementById('stat-service').innerHTML = d.running 
          ? '<span class="status-badge badge-on"><span class="badge-dot"></span>ON (' + d.pid + ')</span>'
          : '<span class="status-badge badge-off"><span class="badge-dot"></span>OFF</span>';

        const lockText = d.lockedLimit ? (' (Lock: ~' + d.lockedLimit + ' MB)') : ' (Booting...)';
        document.getElementById('stat-ram').innerText = d.rssMb + ' MB' + (d.running ? lockText : ' / ' + d.ramLimit + ' MB');
        document.getElementById('stat-dash').innerText = d.dashboardActive ? 'ACTIVE' : 'DORMANT (Lite)';
        document.getElementById('stat-uptime').innerText = d.running ? d.uptimeSec + 's' : '-';

        document.getElementById('toggle-dash').checked = d.dashboardActive;
        document.getElementById('dash-link-container').style.display = d.dashboardActive ? 'block' : 'none';
        document.getElementById('toggle-sync').checked = d.syncActive;
        document.getElementById('toggle-auth').checked = d.requireAuth;
        document.getElementById('toggle-host').checked = d.bindHost === '0.0.0.0';
        document.getElementById('toggle-logs').checked = d.logsActive;

        if (!document.getElementById('input-key').value) document.getElementById('input-key').value = d.apiKey;
        if (!document.getElementById('input-pass').value) document.getElementById('input-pass').value = d.adminPassword;
      } catch (e) {
        console.error(e);
      }
    }

    async function toggleFeature(feat, val) {
      await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: feat, value: val })
      });
      setTimeout(loadStatus, 1500);
    }

    async function saveSettings() {
      const key = document.getElementById('input-key').value;
      const pass = document.getElementById('input-pass').value;
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, pass })
      });
      alert('Pengaturan disimpan & router di-reload!');
      setTimeout(loadStatus, 1500);
    }

    async function restartService() {
      await fetch('/api/restart', { method: 'POST' });
      alert('Restart sinyal terkirim!');
      setTimeout(loadStatus, 1500);
    }

    async function clearLogs() {
      if (!confirm('Bersihkan file log & temporary cache?')) return;
      await fetch('/api/clear-logs', { method: 'POST' });
      alert('Log dibersihkan!');
      fetchLogs();
    }

    async function fetchLogs() {
      try {
        const res = await fetch('/api/logs');
        const text = await res.text();
        const box = document.getElementById('log-content');
        box.innerText = text || '(Log masih kosong)';
        box.scrollTop = box.scrollHeight;
      } catch (e) {
        document.getElementById('log-content').innerText = 'Gagal memuat log.';
      }
    }

    loadStatus();
    fetchLogs();
    setInterval(loadStatus, 5000);
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHtml());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStatus()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs') {
    let logs = '';
    if (fs.existsSync(SERVICE_LOG)) {
      try {
        const data = fs.readFileSync(SERVICE_LOG, 'utf8');
        const lines = data.split('\n');
        logs = lines.slice(-80).join('\n'); // Last 80 lines
      } catch (e) {
        logs = 'Error reading log: ' + e.message;
      }
    } else {
      logs = 'service.log not found yet.';
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(logs);
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body); } catch {}

      if (url.pathname === '/api/toggle') {
        const feat = data.feature;
        const val = data.value;
        const cfg = loadConfig();

        if (feat === 'dashboard') {
          if (val) fs.writeFileSync(UI_FLAG, '1', 'utf8');
          else if (fs.existsSync(UI_FLAG)) fs.unlinkSync(UI_FLAG);
        } else if (feat === 'sync') {
          if (val) fs.writeFileSync(SYNC_FLAG, '1', 'utf8');
          else if (fs.existsSync(SYNC_FLAG)) fs.unlinkSync(SYNC_FLAG);
        } else if (feat === 'logs') {
          if (val) fs.writeFileSync(LOG_FLAG, '1', 'utf8');
          else if (fs.existsSync(LOG_FLAG)) fs.unlinkSync(LOG_FLAG);
        } else if (feat === 'auth') {
          cfg.REQUIRE_AUTH = val ? 'true' : 'false';
          saveConfig(cfg);
        } else if (feat === 'host') {
          cfg.BIND_HOST = val ? '0.0.0.0' : '127.0.0.1';
          saveConfig(cfg);
        }

        reloadService();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (url.pathname === '/api/settings') {
        const cfg = loadConfig();
        if (data.ram && parseInt(data.ram, 10) >= 150) cfg.CUSTOM_RAM_LIMIT = data.ram;
        if (data.key) cfg.CUSTOM_API_KEY = data.key;
        if (data.pass) cfg.CUSTOM_ADMIN_PASSWORD = data.pass;
        saveConfig(cfg);
        reloadService();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (url.pathname === '/api/restart') {
        reloadService();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (url.pathname === '/api/clear-logs') {
        try {
          if (fs.existsSync(SERVICE_LOG)) fs.writeFileSync(SERVICE_LOG, '', 'utf8');
          const tmpDir = path.join(DATA_DIR, 'tmp');
          if (fs.existsSync(tmpDir)) {
            for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
          }
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      res.writeHead(404);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ControlCenter] Web UI running on http://0.0.0.0:${PORT}`);
});
