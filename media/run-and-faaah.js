#!/usr/bin/env node
// FAAAH - Run a command and play sound on failure
// Usage: node run-and-faaah.js <soundFile> <command> [args...]
// Example: node run-and-faaah.js "/path/to/faaah.wav" node "script.js"
const { execFileSync, exec, execFile } = require('child_process');
const os = require('os');

const soundFile = process.argv[2];
const cmd = process.argv[3];
const args = process.argv.slice(4);

if (!cmd) { console.error('Usage: node run-and-faaah.js <sound> <cmd> [args]'); process.exit(1); }

try {
    execFileSync(cmd, args, { stdio: 'inherit' });
} catch (e) {
    // Command failed — play the sound
    const p = os.platform();
    if (p === 'darwin') {
        execFile('afplay', [soundFile]);
    } else if (p === 'win32') {
        exec(`powershell -c "(New-Object System.Media.SoundPlayer '${soundFile.replace(/'/g, "''")}').PlaySync()"`);
    } else {
        exec(`aplay -q "${soundFile}" 2>/dev/null || paplay "${soundFile}" 2>/dev/null`);
    }
    process.exit(e.status || 1);
}
