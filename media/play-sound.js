// FAAAH - Cross-platform sound player (Node.js)
// Usage: node play-sound.js "/path/to/sound.wav"
const { exec, execFile } = require('child_process');
const os = require('os');
const soundFile = process.argv[2];
if (!soundFile) process.exit(0);
const p = os.platform();
if (p === 'darwin') {
    execFile('afplay', [soundFile]);
} else if (p === 'win32') {
    exec(`powershell -c "(New-Object System.Media.SoundPlayer '${soundFile.replace(/'/g, "''")}').PlaySync()"`);
} else {
    exec(`aplay -q "${soundFile}" 2>/dev/null || paplay "${soundFile}" 2>/dev/null`);
}
