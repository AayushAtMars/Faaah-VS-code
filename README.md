# FAAAH Sounds - Your Code's Worst Critic 🎺💥

A dramatic, zero-setup VS Code extension that plays a loud, cinematic **"FAAAH!"** sound effect whenever your code crashes, fails to compile, or your tests fail. 

Because failures deserve to be felt.

![FAAAH Logo](media/faaah_logo.png)

## Features

- **Zero-Config Crash Detection**: Automatically hooks into the popular **Code Runner** extension to detect crashes across multiple languages.
- **Test Runner Integration**: Detects failure outputs natively in the terminal and via the VS Code Testing API.
- **Cross-Platform**: Works seamlessly on **Windows**, **macOS**, and **Linux** — no shell compatibility issues.
- **Customizable Sounds**: Drop your own `.wav` files into the extension to customize the dramatic feedback!
- **Non-Intrusive**: Runs silently in the background.

## 🚀 Supported Languages

Out-of-the-box, FAAAH instantly detects execution crashes and compilation errors when you hit **Play** using Code Runner:

- **JavaScript / Node.js**
- **Python**
- **C++ / C** *(Linux/macOS)*
- **Java** *(Linux/macOS)*

*(Just write broken code, hit play, and hear the magic).*

## How It Works

VS Code prevents extensions from directly reading terminal output. To solve this, **FAAAH** uses a clever integration:

- **Windows**: Wraps your execution command in a Node.js runner script that catches failures and plays the sound — no shell operators needed.
- **Linux/macOS**: Injects a lightweight `|| node play-sound.js` fallback into the Code Runner pipeline.
- **All Platforms**: Also monitors the VS Code Testing API and terminal output patterns for test failures.

### Commands
- `FAAAH: Toggle On/Off` — Enable/disable sound effects
- `FAAAH: Play Sound` — Test the volume!
- `FAAAH: Run Node Script` — Built-in fail-safe runner
- `FAAAH: Cleanup Terminal UI (Silent Mode)` — Hide Code Runner execution messages

## Requirements
- **[Code Runner](https://marketplace.visualstudio.com/items?itemName=formulahendry.code-runner)** extension is highly recommended for the best experience.
- **Node.js** must be installed (most developers already have it).

## Configuration

Customize through VS Code settings (`Ctrl+,` → search `FAAAH`):

- `faaah.enabled`: Turn it off when you're in a library.
- `faaah.volume`: Adjust the macOS blast radius.
- `faaah.cooldownMs`: Time between sounds to prevent spam.
- `faaah.sounds`: Map custom sound files to events.

## Enjoy the chaos!
