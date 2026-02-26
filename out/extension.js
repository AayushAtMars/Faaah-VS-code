"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
// ─── Audio Player ────────────────────────────────────────────────────
class AudioPlayer {
    constructor() {
        this.proc = null;
    }
    play(filePath, volume = 1.0) {
        this.stop();
        const p = os.platform();
        try {
            if (p === 'darwin') {
                this.proc = (0, child_process_1.execFile)('afplay', [filePath, '-v', String(volume)], () => { this.proc = null; });
            }
            else if (p === 'win32') {
                const ps = `Add-Type -AssemblyName System.Media; $p = New-Object System.Media.SoundPlayer '${filePath.replace(/'/g, "''")}'; $p.PlaySync()`;
                this.proc = (0, child_process_1.execFile)('powershell', ['-Command', ps], () => { this.proc = null; });
            }
            else {
                this.proc = (0, child_process_1.execFile)('aplay', ['-q', filePath], (err) => {
                    if (err) {
                        this.proc = (0, child_process_1.execFile)('paplay', [filePath], () => { this.proc = null; });
                    }
                    else {
                        this.proc = null;
                    }
                });
            }
        }
        catch { }
    }
    stop() { if (this.proc) {
        this.proc.kill();
        this.proc = null;
    } }
    dispose() { this.stop(); }
}
// ─── Globals ─────────────────────────────────────────────────────────
let statusBar;
let player;
let lastPlay = 0;
let debug;
const cfg = (key, def) => vscode.workspace.getConfiguration('faaah').get(key, def);
// ─── Activate ────────────────────────────────────────────────────────
function activate(ctx) {
    debug = vscode.window.createOutputChannel("FAAAH Debug");
    player = new AudioPlayer();
    // Status bar
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'faaah.toggle';
    updateStatusBar();
    statusBar.show();
    ctx.subscriptions.push(statusBar);
    // Commands
    ctx.subscriptions.push(vscode.commands.registerCommand('faaah.playSound', () => playSound(ctx, true)), vscode.commands.registerCommand('faaah.toggle', () => {
        const on = !cfg('enabled', true);
        vscode.workspace.getConfiguration('faaah').update('enabled', on, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`FAAAH is now ${on ? '🔊 ON' : '🔇 OFF'}`);
        updateStatusBar();
    }), vscode.commands.registerCommand('faaah.silentMode', async () => {
        const cr = vscode.workspace.getConfiguration('code-runner');
        await cr.update('showExecutionMessage', false, vscode.ConfigurationTarget.Global);
        await cr.update('clearPreviousOutput', true, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage("FAAAH: Silent Mode enabled!");
    }), vscode.commands.registerCommand('faaah.runScript', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active file!");
            return;
        }
        const fp = editor.document.uri.fsPath;
        if (editor.document.isDirty)
            editor.document.save();
        let term = vscode.window.terminals.find(t => t.name === 'FAAAH Runner');
        if (!term)
            term = vscode.window.createTerminal('FAAAH Runner');
        term.show();
        term.sendText(os.platform() === 'win32' ? `node "${fp}"` : `node '${fp}'`);
        (0, child_process_1.execFile)('node', [fp], (err) => { if (err)
            playSound(ctx); });
    }));
    // Testing API
    try {
        const d = vscode.tests.onDidChangeTestResults(() => {
            if (!cfg('enabled', true))
                return;
            const results = vscode.tests.testResults;
            if (!results?.length)
                return;
            const latest = results[0];
            if (latest?.results) {
                for (const [, r] of latest.results) {
                    if (r.state === 4 || r.state === 5) {
                        playSound(ctx);
                        break;
                    }
                }
            }
        });
        ctx.subscriptions.push(d);
    }
    catch { }
    // Terminal monitoring
    if (cfg('detectFromTerminal', true))
        setupTerminalWatch(ctx);
    // Config listener
    ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('faaah')) {
            updateStatusBar();
            injectCodeRunnerHook(ctx);
        }
    }));
    injectCodeRunnerHook(ctx);
}
// ─── Code Runner Integration ─────────────────────────────────────────
function injectCodeRunnerHook(ctx) {
    if (!cfg('enabled', true))
        return;
    const crCfg = vscode.workspace.getConfiguration('code-runner');
    const map = crCfg.get('executorMap') || {};
    let updated = false;
    const newMap = { ...map };
    const platform = os.platform();
    const soundMap = cfg('sounds', {});
    const soundFile = soundMap['testFail'] || 'faaah.wav';
    const soundPath = path.isAbsolute(soundFile) ? soundFile : path.join(ctx.extensionPath, 'media', soundFile);
    const playerScript = path.join(ctx.extensionPath, 'media', 'play-sound.js');
    // Windows: PowerShell-native error check (works in ALL PS versions)
    const winHook = ` ; if (-not $?) { node "${playerScript}" "${soundPath}" }`;
    // Linux/Mac: standard shell || operator
    const unixHook = ` || node "${playerScript}" "${soundPath}"`;
    const targets = [
        { lang: 'javascript', def: 'node' },
        { lang: 'python', def: 'python -u' },
        { lang: 'cpp', def: 'cd $dir && g++ $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt' },
        { lang: 'c', def: 'cd $dir && gcc $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt' },
        { lang: 'java', def: 'cd $dir && javac $fileName && java $fileNameWithoutExt' }
    ];
    const runInTerminal = crCfg.get('runInTerminal', false);
    for (const t of targets) {
        let cmd = (newMap[t.lang] && typeof newMap[t.lang] === 'string') ? newMap[t.lang] : t.def;
        // Force-clean old broken hooks
        if (cmd.includes('play-sound.js') || cmd.includes('run-and-faaah.js'))
            continue;
        if (cmd.includes('aplay') || cmd.includes('afplay') || cmd.includes('SoundPlayer') || cmd.includes('cmd /c')) {
            cmd = t.def;
        }
        if (!cmd.includes('$'))
            cmd = `${cmd} $fullFileName`;
        if (platform === 'win32') {
            // Append PowerShell-native error check — works with ALL commands
            newMap[t.lang] = `${cmd}${winHook}`;
        }
        else if (runInTerminal) {
            newMap[t.lang] = `${cmd}${unixHook}`;
        }
        else {
            newMap[t.lang] = `sh -c '${cmd.replace(/'/g, "'\\''")}${unixHook}'`;
        }
        updated = true;
    }
    if (updated)
        crCfg.update('executorMap', newMap, vscode.ConfigurationTarget.Global);
}
// ─── Terminal Monitoring ─────────────────────────────────────────────
const FAIL_PATTERNS = [
    /\bFAIL(?:ED|URE|S)?\b/i, /Tests?:\s+\d+\s+failed/i, /(\d+)\s+(?:failing|failed)/i,
    /✗|✘|❌/, /ERRORS?!/i, /AssertionError/i, /Test suite failed/i, /npm ERR! Test failed/i,
    /FAILED \(failures=/i, /\d+ passed, \d+ failed/i, /--- FAIL:/,
    /BUILD FAILED/i, /FAILURES!/i,
    /SyntaxError:/i, /ReferenceError:/i, /TypeError:/i,
    /Traceback \(most recent call last\):/i, /Exception in thread/i, /panic:/i
];
function setupTerminalWatch(ctx) {
    // Task exit code monitoring
    ctx.subscriptions.push(vscode.tasks.onDidEndTaskProcess((e) => {
        if (!cfg('enabled', true) || !cfg('detectFromTerminal', true))
            return;
        if (e.exitCode && e.exitCode !== 0) {
            const name = e.execution.task.name.toLowerCase();
            if (name.includes('test') || name.includes('fail') ||
                e.execution.task.group === vscode.TaskGroup.Test) {
                playSound(ctx);
            }
        }
    }));
    // Terminal data monitoring (VS Code 1.93+)
    try {
        ctx.subscriptions.push(vscode.window.onDidWriteTerminalData((e) => {
            if (!cfg('enabled', true) || !cfg('detectFromTerminal', true))
                return;
            for (const p of FAIL_PATTERNS) {
                if (p.test(e.data)) {
                    playSound(ctx);
                    break;
                }
            }
        }));
    }
    catch { }
    // Output channel monitoring (Code Runner fallback)
    ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
        if (!cfg('enabled', true) || !cfg('detectFromTerminal', true))
            return;
        const uri = e.document.uri.toString();
        if ((e.document.uri.scheme === 'output' || uri.includes('output') || uri.includes('Code'))
            && !uri.includes('FAAAH Debug')
            && !(e.document.uri.scheme === 'file' && !uri.includes('output'))) {
            for (const c of e.contentChanges) {
                for (const p of FAIL_PATTERNS) {
                    if (p.test(c.text)) {
                        playSound(ctx);
                        return;
                    }
                }
            }
        }
    }));
}
// ─── Sound Playback ──────────────────────────────────────────────────
function playSound(ctx, force = false) {
    if (!force && !cfg('enabled', true))
        return;
    const cooldown = cfg('cooldownMs', 3000);
    const now = Date.now();
    if (!force && now - lastPlay < cooldown)
        return;
    lastPlay = now;
    const soundMap = cfg('sounds', {});
    const file = soundMap['testFail'] || 'faaah.wav';
    const soundPath = path.isAbsolute(file) ? file : path.join(ctx.extensionPath, 'media', file);
    player.play(soundPath, cfg('volume', 1.0));
    // Flash status bar
    const orig = statusBar.text;
    statusBar.text = '$(megaphone) FAAAH!';
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    setTimeout(() => { statusBar.text = orig; statusBar.backgroundColor = undefined; }, 1500);
}
// ─── Helpers ─────────────────────────────────────────────────────────
function updateStatusBar() {
    const on = cfg('enabled', true);
    statusBar.text = on ? '$(unmute) FAAAH' : '$(mute) FAAAH';
    statusBar.tooltip = on ? 'FAAAH is active — click to disable' : 'FAAAH is disabled — click to enable';
}
function deactivate() { player?.dispose(); }
//# sourceMappingURL=extension.js.map