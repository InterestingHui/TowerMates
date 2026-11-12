const { spawn, spawnSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const net = require('net'); const path = require('path');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-probe-'));
const probe = net.createServer();
probe.listen(0, '127.0.0.1', () => {
  const PORT = probe.address().port;
  probe.close(() => {
    const server = spawn(process.execPath, ['tools/serve.js', String(PORT), path.resolve(__dirname)], { stdio: 'ignore' });
    setTimeout(() => {
      const r = spawnSync(chrome, [
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + profile, '--virtual-time-budget=15000',
        '--dump-dom', 'http://127.0.0.1:' + PORT + '/tools/vow-eco-check.html',
      ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 60000 });
      const m = (r.stdout || '').match(/<pre id="out">([\s\S]*?)<\/pre>/);
      fs.writeFileSync(path.join(__dirname, 'ui-probe-out.txt'), 'PROBE:' + (m ? m[1] : 'no-match len=' + (r.stdout || '').length) + '\n');
      server.kill();
      process.exit(0);
    }, 1200);
  });
});
