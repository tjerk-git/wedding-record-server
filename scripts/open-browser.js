#!/usr/bin/env node
const { spawn } = require('child_process');

const url = process.argv[2] || 'http://localhost:3000';

function openOnDarwin(u) {
  // macOS: open Chrome in fullscreen
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  
  function tryChrome(index) {
    if (index >= chromePaths.length) {
      // Fallback to default browser if Chrome not found
      spawn('open', [u], { stdio: 'ignore', detached: true }).unref();
      return;
    }
    
    const chromePath = chromePaths[index];
    const child = spawn(chromePath, ['--start-fullscreen', '--new-window', u], { stdio: 'ignore', detached: true });
    child.on('error', () => tryChrome(index + 1));
    child.unref();
  }
  
  tryChrome(0);
}

function openOnWindows(u) {
  // Windows: start default browser
  spawn('cmd', ['/c', 'start', '', u], { stdio: 'ignore', detached: true }).unref();
}

function openChromiumLinux(u) {
  // Ubuntu with Chromium: try chromium or google-chrome
  const candidates = [
    ['chromium-browser', ['--start-fullscreen', '--start-maximized', '--new-window', u]],
    ['chromium', ['--start-fullscreen', '--start-maximized', '--new-window', u]],
    ['google-chrome', ['--start-fullscreen', '--start-maximized', '--new-window', u]],
    ['google-chrome-stable', ['--start-fullscreen', '--start-maximized', '--new-window', u]],
  ];

  function tryNext(index) {
    if (index >= candidates.length) return;
    const [cmd, args] = candidates[index];
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => tryNext(index + 1));
    child.unref();
  }

  tryNext(0);

  // Best-effort: bring window to foreground if wmctrl is present
  // Delay a bit to let the window appear
  const focusCmd = 'sleep 1; (wmctrl -a "Chromium" || wmctrl -a "Google Chrome" || true)';
  spawn('bash', ['-lc', focusCmd], { stdio: 'ignore', detached: true }).unref();
}

function main() {
  const platform = process.platform;
  if (platform === 'darwin') return openOnDarwin(url);
  if (platform === 'win32') return openOnWindows(url);
  // linux
  return openChromiumLinux(url);
}

main();


