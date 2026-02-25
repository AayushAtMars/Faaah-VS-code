import * as vscode from 'vscode';
import * as path from 'path';
import { execFile, ChildProcess } from 'child_process';
import * as os from 'os';

// ─── Sound Event Registry ────────────────────────────────────────────
// Scalable architecture: add new events here and they auto-wire up.
// Each event has a key (used in config), default sound, and detection logic.

type SoundEvent = 'testFail';

interface SoundEventDef {
    key: SoundEvent;
    defaultSound: string;
    description: string;
}

const SOUND_EVENTS: SoundEventDef[] = [
    {
        key: 'testFail',
        defaultSound: 'faaah.wav',
        description: 'Played when a test fails',
    },
    // ── Add more events here ──────────────────────────────────────────
    // {
    //   key: 'buildFail',
    //   defaultSound: 'oof.wav',
    //   description: 'Played when a build fails',
    // },
    // {
    //   key: 'deploySuccess',
    //   defaultSound: 'tada.wav',
    //   description: 'Played when a deploy succeeds',
    // },
];

// ─── Audio Player ────────────────────────────────────────────────────

class AudioPlayer {
    private currentProcess: ChildProcess | null = null;
    private debugChannel: vscode.OutputChannel | undefined;

    constructor(debugChannel?: vscode.OutputChannel) {
        this.debugChannel = debugChannel;
    }

    play(filePath: string, volume: number = 1.0): void {
        this.debugChannel?.appendLine(`[FAAAH AudioPlayer] play called with: ${filePath}, volume: ${volume}`);
        // Kill any currently playing sound to avoid overlap
        this.stop();

        const platform = os.platform();
        this.debugChannel?.appendLine(`[FAAAH AudioPlayer] Platform detected: ${platform}`);

        try {
            if (platform === 'darwin') {
                // macOS: afplay is built-in
                const args = [filePath, '-v', String(volume)];
                this.currentProcess = execFile('afplay', args, (err) => {
                    if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
                        console.error('[FAAAH] Audio playback error:', err.message);
                    }
                    this.currentProcess = null;
                });
            } else if (platform === 'win32') {
                // Windows: PowerShell media player
                const psScript = `
          Add-Type -AssemblyName System.Media;
          $player = New-Object System.Media.SoundPlayer '${filePath.replace(/'/g, "''")}';
          $player.PlaySync();
        `;
                this.currentProcess = execFile('powershell', ['-Command', psScript], (err) => {
                    if (err) {
                        console.error('[FAAAH] Audio playback error:', err.message);
                    }
                    this.currentProcess = null;
                });
            } else {
                // Linux: try aplay (for .wav), paplay, or mpg123/ffplay
                const ext = path.extname(filePath).toLowerCase();
                let cmd: string;
                let args: string[];

                if (ext === '.wav') {
                    cmd = 'aplay';
                    args = ['-q', filePath];
                } else if (ext === '.mp3') {
                    cmd = 'mpg123';
                    args = ['-q', filePath];
                } else {
                    cmd = 'paplay';
                    args = [filePath];
                }

                this.currentProcess = execFile(cmd, args, (err) => {
                    if (err) {
                        // Fallback: try paplay if primary fails
                        if (cmd !== 'paplay') {
                            this.currentProcess = execFile('paplay', [filePath], (err2) => {
                                if (err2) {
                                    console.error('[FAAAH] Audio playback error:', err2.message);
                                }
                                this.currentProcess = null;
                            });
                        } else {
                            console.error('[FAAAH] Audio playback error:', err.message);
                            this.currentProcess = null;
                        }
                    } else {
                        this.currentProcess = null;
                    }
                });
            }
        } catch (err) {
            console.error('[FAAAH] Failed to start audio player:', err);
        }
    }

    stop(): void {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = null;
        }
    }

    dispose(): void {
        this.stop();
    }
}

// ─── Main Extension ─────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let audioPlayer: AudioPlayer;
let lastPlayTime: Map<string, number> = new Map();
let debugChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    debugChannel = vscode.window.createOutputChannel("FAAAH Debug");
    debugChannel.appendLine("[FAAAH] Extension activated! 🎺");

    audioPlayer = new AudioPlayer(debugChannel);

    // ── Status Bar ──────────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'faaah.toggle';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ── Commands ────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('faaah.playSound', () => {
            debugChannel.appendLine("[FAAAH] Manual playSound command triggered");
            playEventSound(context, 'testFail', true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('faaah.runScript', () => {
            debugChannel.appendLine("[FAAAH] runScript command triggered");
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active file to run!");
                return;
            }

            const filePath = editor.document.uri.fsPath;
            if (editor.document.isDirty) {
                editor.document.save();
            }

            debugChannel.appendLine(`[FAAAH] Running script: ${filePath}`);

            // Create or reuse terminal
            let terminal = vscode.window.terminals.find(t => t.name === 'FAAAH Runner');
            if (!terminal) {
                terminal = vscode.window.createTerminal('FAAAH Runner');
            }
            terminal.show();

            const platform = os.platform();
            const cmd = platform === 'win32' ? `node "${filePath}"` : `node '${filePath}'`;
            terminal.sendText(cmd);

            // Execute silently in background to catch the exit code
            // (Since we can't read the terminal output reliably via API)
            execFile('node', [filePath], (error, stdout, stderr) => {
                if (error) {
                    debugChannel.appendLine(`[FAAAH] Script exited with error: ${error.message}`);
                    playEventSound(context, 'testFail');
                } else {
                    debugChannel.appendLine("[FAAAH] Script executed successfully.");
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('faaah.toggle', () => {
            const config = vscode.workspace.getConfiguration('faaah');
            const current = config.get<boolean>('enabled', true);
            config.update('enabled', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
                `FAAAH is now ${!current ? '🔊 ON' : '🔇 OFF'}`
            );
            debugChannel.appendLine(`[FAAAH] Toggled state to: ${!current}`);
        })
    );

    // ... (Testing API listener)
    try {
        const testDisposable = (vscode.tests as any).onDidChangeTestResults(
            (results: any) => {
                debugChannel.appendLine("[FAAAH] Test results changed event fired");
                if (!getConfig<boolean>('enabled', true)) {
                    return;
                }

                try {
                    // Check the most recent result set
                    const latestResults = (vscode.tests as any).testResults;
                    if (!latestResults || latestResults.length === 0) {
                        return;
                    }

                    const latest = latestResults[0];
                    let hasFailure = false;

                    // Walk through the result snapshot
                    // TestResultState: Failed = 4, Errored = 5 (proposed API)
                    const TEST_STATE_FAILED = 4;
                    const TEST_STATE_ERRORED = 5;

                    if (latest && latest.results) {
                        for (const [, result] of latest.results) {
                            if (
                                result.state === TEST_STATE_FAILED ||
                                result.state === TEST_STATE_ERRORED
                            ) {
                                hasFailure = true;
                                break;
                            }
                        }
                    }

                    if (hasFailure) {
                        debugChannel.appendLine("[FAAAH] Detected failure via Testing API");
                        playEventSound(context, 'testFail');
                    }
                } catch (e) {
                    debugChannel.appendLine(`[FAAAH] Error processing test results: ${e}`);
                }
            }
        );
        context.subscriptions.push(testDisposable);
    } catch {
        // Testing API may not be available in older VS Code versions
        debugChannel.appendLine('[FAAAH] Testing API not available, using terminal detection only.');
    }

    // ── Terminal Output Monitoring ──────────────────────────────────
    if (getConfig<boolean>('detectFromTerminal', true)) {
        debugChannel.appendLine("[FAAAH] Setting up terminal monitoring...");
        setupTerminalMonitoring(context, debugChannel);
    }

    // ── Config Change Listener ─────────────────────────────────────
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('faaah')) {
                updateStatusBar();
                debugChannel.appendLine("[FAAAH] Configuration updated");
                injectCodeRunnerHook(context);
            }
        })
    );

    // Try to inject our hook into Code Runner on startup
    injectCodeRunnerHook(context);
}

// ─── Code Runner Integration ─────────────────────────────────────────

function injectCodeRunnerHook(context: vscode.ExtensionContext) {
    if (!getConfig<boolean>('enabled', true)) return;

    const codeRunnerConfig = vscode.workspace.getConfiguration('code-runner');
    const executorMap = codeRunnerConfig.get<any>('executorMap');

    if (executorMap && typeof executorMap === 'object') {
        let updated = false;
        const newMap = { ...executorMap };

        const platform = os.platform();
        // Determine the right audio command based on the OS
        // Default to aplay for Linux, afplay for Mac, PowerShell for Windows
        let audioCmd = 'aplay';
        if (platform === 'darwin') audioCmd = 'afplay';
        if (platform === 'win32') audioCmd = 'powershell -c (New-Object System.Media.SoundPlayer \\"$soundFile\\").PlaySync()';

        // Get the resolved sound path
        const soundMap = getConfig<Record<string, string>>('sounds', {});
        const soundFile = soundMap['testFail'] || 'faaah.wav';
        const fullSoundPath = path.isAbsolute(soundFile) ? soundFile : path.join(context.extensionPath, 'media', soundFile);

        // Build the hook payload: "|| aplay /path/to/sound.wav"
        let hook = ` || ${audioCmd} "${fullSoundPath}"`;
        if (platform === 'win32') {
            const psHook = audioCmd.replace('$soundFile', fullSoundPath.replace(/"/g, '""'));
            hook = ` || ${psHook}`;
        }

        // We target Javascript/Node.js, Python, C++, C, and Java for seamless integration
        const targets = [
            { lang: 'javascript', defaultCmd: 'node' },
            { lang: 'python', defaultCmd: 'python -u' },
            { lang: 'cpp', defaultCmd: 'cd $dir && g++ $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt' },
            { lang: 'c', defaultCmd: 'cd $dir && gcc $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt' },
            { lang: 'java', defaultCmd: 'cd $dir && javac $fileName && java $fileNameWithoutExt' }
        ];

        for (const target of targets) {
            let currentCmd = newMap[target.lang];

            // If they are using the default command without our hook, or have a buggy injection, fix it!
            if (currentCmd && typeof currentCmd === 'string') {
                // Check if we previously injected a buggy string (missing $fullFileName)
                const isBuggy = currentCmd.includes('faaah') && !currentCmd.includes('$full');
                if (isBuggy) {
                    currentCmd = target.defaultCmd;
                }

                if (!currentCmd.includes('faaah.wav') && !currentCmd.includes('afplay') && !currentCmd.includes('aplay')) {
                    // If the command doesn't specify where to put the file, Code Runner appends it at the end.
                    // We must explicitly place the file BEFORE our `||` hook so the runner doesn't append it to `aplay`.
                    if (!currentCmd.includes('$')) {
                        currentCmd = `${currentCmd} $fullFileName`;
                    }

                    if (platform === 'win32') {
                        newMap[target.lang] = `${currentCmd}${hook}`;
                    } else {
                        // On Linux/Mac, if runInTerminal is false, Code Runner uses child_process.spawn
                        // which doesn't know what `||` is. By wrapping in `sh -c`, we force shell evaluation.
                        newMap[target.lang] = `sh -c '${currentCmd.replace(/'/g, "'\\''")}${hook}'`;
                    }
                    updated = true;
                    debugChannel.appendLine(`[FAAAH] Injected hook into Code Runner for ${target.lang}`);
                }
            }
        }

        if (updated) {
            // Update the global settings
            codeRunnerConfig.update('executorMap', newMap, vscode.ConfigurationTarget.Global);
        }
    }
}

// ─── Terminal Monitoring ─────────────────────────────────────────────

function setupTerminalMonitoring(context: vscode.ExtensionContext, debugChannel: vscode.OutputChannel) {
    // Common test failure patterns across frameworks
    const FAILURE_PATTERNS = [
        /\bFAIL(?:ED|URE|S)?\b/i,
        /Tests?:\s+\d+\s+failed/i,
        /(\d+)\s+(?:failing|failed)/i,
        /✗|✘|❌/,
        /ERRORS?!/i,
        /AssertionError/i,
        /AssertError/i,
        /Test suite failed/i,
        /npm ERR! Test failed/i,
        /FAILED \(failures=/i,         // pytest
        /\d+ passed, \d+ failed/i,     // various
        /--- FAIL:/,                    // Go
        /BUILD FAILED/i,                // Gradle
        /FAILURES!/i,                   // JUnit

        // General scripting errors (for code execution via Play button)
        /SyntaxError:/i,
        /ReferenceError:/i,
        /TypeError:/i,
        /Traceback \(most recent call last\):/i, // Python
        /Exception in thread/i,                  // Java
        /panic:/i                                // Go
    ];

    context.subscriptions.push(
        vscode.tasks.onDidEndTaskProcess((e) => {
            debugChannel.appendLine(`[FAAAH] Task ended with exit code: ${e.exitCode}`);
            if (!getConfig<boolean>('enabled', true)) {
                return;
            }
            if (!getConfig<boolean>('detectFromTerminal', true)) {
                return;
            }

            // If a task exits with non-zero, it likely failed
            if (e.exitCode && e.exitCode !== 0) {
                const taskName = e.execution.task.name.toLowerCase();
                const isTestTask =
                    taskName.includes('test') ||
                    e.execution.task.group === vscode.TaskGroup.Test ||
                    e.execution.task.group?.id === 'test';

                debugChannel.appendLine(`[FAAAH] Checking task: ${taskName}, isTestTask: ${isTestTask}`);

                if (isTestTask || taskName.includes('fail')) {
                    debugChannel.appendLine("[FAAAH] Task identified as a fading test. Triggering sound...");
                    playEventSound(context, 'testFail');
                }
            }
        })
    );

    // Monitor terminal data via shell integration (VS Code 1.93+)
    try {
        context.subscriptions.push(
            (vscode.window as any).onDidWriteTerminalData(
                (e: { terminal: vscode.Terminal; data: string }) => {
                    if (!getConfig<boolean>('enabled', true)) {
                        return;
                    }
                    if (!getConfig<boolean>('detectFromTerminal', true)) {
                        return;
                    }

                    for (const pattern of FAILURE_PATTERNS) {
                        if (pattern.test(e.data)) {
                            debugChannel.appendLine(`[FAAAH] Detected failure text pattern in terminal: ${pattern}`);
                            playEventSound(context, 'testFail');
                            break;
                        }
                    }
                }
            )
        );
    } catch {
        debugChannel.appendLine('[FAAAH] Terminal data monitoring not available.');
    }

    // ── Fallback: Monitor Output Channels (like "Code Runner") ──
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (!getConfig<boolean>('enabled', true) || !getConfig<boolean>('detectFromTerminal', true)) {
                return;
            }

            const uriRaw = e.document.uri.toString();

            // Broad check for output panels: scheme 'output' or 'vscode-extension-output' or path with 'output'
            if (e.document.uri.scheme === 'output' || uriRaw.includes('output') || uriRaw.includes('Code')) {
                // If it's the FAAAH debug channel itself, ignore to avoid feedback loops!
                const isDebugChannel = uriRaw.includes('FAAAH Debug');

                // Exclude normal code files being actively edited
                const isCodeFile = e.document.uri.scheme === 'file' && !uriRaw.includes('output');

                if (!isDebugChannel && !isCodeFile) {
                    for (const change of e.contentChanges) {
                        for (const pattern of FAILURE_PATTERNS) {
                            if (pattern.test(change.text)) {
                                debugChannel.appendLine(`[FAAAH] Detected failure text pattern in Output Channel (${uriRaw}): ${pattern}`);
                                playEventSound(context, 'testFail');
                                return; // break both loops
                            }
                        }
                    }
                }
            }
        })
    );
}

// ─── Sound Playback ──────────────────────────────────────────────────

function playEventSound(
    context: vscode.ExtensionContext,
    event: SoundEvent,
    force: boolean = false
): void {
    if (!force && !getConfig<boolean>('enabled', true)) {
        return;
    }

    // Cooldown check
    const cooldown = getConfig<number>('cooldownMs', 3000);
    const now = Date.now();
    const lastTime = lastPlayTime.get(event) || 0;

    if (!force && now - lastTime < cooldown) {
        return;
    }
    lastPlayTime.set(event, now);

    // Resolve sound file
    const soundMap = getConfig<Record<string, string>>('sounds', {});
    const eventDef = SOUND_EVENTS.find((e) => e.key === event);
    const soundFile = soundMap[event] || eventDef?.defaultSound || 'faaah.wav';

    // Check if it's an absolute path or relative to media/
    let soundPath: string;
    if (path.isAbsolute(soundFile)) {
        soundPath = soundFile;
    } else {
        soundPath = path.join(context.extensionPath, 'media', soundFile);
    }

    const volume = getConfig<number>('volume', 1.0);

    console.log(`[FAAAH] 🔊 Playing "${event}" sound: ${soundPath}`);
    audioPlayer.play(soundPath, volume);

    // Flash the status bar for visual feedback
    const origText = statusBarItem.text;
    statusBarItem.text = '$(megaphone) FAAAH!';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
    );
    setTimeout(() => {
        statusBarItem.text = origText;
        statusBarItem.backgroundColor = undefined;
    }, 1500);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getConfig<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('faaah').get<T>(key, defaultValue);
}

function updateStatusBar() {
    const enabled = getConfig<boolean>('enabled', true);
    statusBarItem.text = enabled ? '$(unmute) FAAAH' : '$(mute) FAAAH';
    statusBarItem.tooltip = enabled
        ? 'FAAAH is active — click to disable'
        : 'FAAAH is disabled — click to enable';
}

export function deactivate() {
    audioPlayer?.dispose();
}
