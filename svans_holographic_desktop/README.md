# SVANS Holographic Desktop

An isolated Windows desktop prototype for the SVANS conversational and holographic interface. It does not replace the production SVANSAI or Vansant Platform applications.

## What is working

- Holographic owner login with the `admin` operator name
- One-way scrypt access-code storage, five-attempt rate limiting, and a 30-second lockout
- Main-process authorization checks that block telemetry, AI, external links, and privileged window modes until login
- One-click locking from the command deck power icon
- Real owner-level Windows action registry for approved files, applications, games, browsers, and processes
- Start menu application discovery and launching, including installed game launchers
- File and folder listing/search restricted to approved owner roots
- Process inspection and confirmed termination with protected-process blocking
- Administrator Guardian capability with confirmation, UAC, and named operations only
- Emergency stop from Shield or `Ctrl+Alt+Shift+Escape`
- Frameless Electron command deck
- Windows tray presence and `Ctrl+Space` show/hide shortcut
- Always-on-top control
- Compact ambient-orb mode
- Live CPU, memory, uptime, host, processor, and network telemetry
- Animated holographic core, orbital controls, particle field, and voice spectrum
- Real SVANSAI conversation bridge through `https://svansai.com/api/chat`
- Browser speech recognition when supported by the installed Electron/Chromium build
- Human-like neural spoken responses using the OpenAI Speech API and the `cedar` voice
- Automatic Windows/Chromium speech fallback when neural speech is unavailable
- Generated system, project, diagnostic, and Guardian hologram panels
- Priority queue, activity audit stream, and permission center
- Walkthrough demonstration: say or type `walk me through the interface`
- Allowlisted links to Vansant Platform and SVANSAI

## Run it

From the Vansant Platform repository root:

```powershell
npm run svans:hud
```

The app remains available in the Windows system tray when hidden. Press `Ctrl+Space` to summon or hide it.

## Computer commands

Direct owner commands are recognized locally and never inferred from webpage content or assistant responses. Examples:

- `Open Notepad`
- `Launch Steam`
- `Show my Downloads`
- `Open my Documents folder`
- `Find a file named budget`
- `Show running applications`
- `Close Calculator` (requires confirmation)
- `Lock my computer` (requires confirmation)
- `Flush DNS` (requires Administrator Guardian, confirmation, and UAC)
- `Emergency stop`

Owner files, applications, browser destinations, and process control are enabled by default and can be disabled individually in Shield. Administrator Guardian starts disabled and must be explicitly authorized each session.

## Check the JavaScript

```powershell
npm run svans:hud:check
```

## Package it later

The prototype has an Electron Builder configuration. To package it as its own installer, install its dependencies and build from this directory:

```powershell
cd svans_holographic_desktop
npm install
npm run dist:win
```

Packaged output will be written to `svans_holographic_desktop/dist/`, which is ignored by Git.

## Security boundary

The renderer does not have Node.js access. It communicates through a narrow preload bridge. The owner access code is stored only as a derived digest, not readable text. The OpenAI API key remains in the Electron main process and is never exposed to renderer JavaScript. Neural speech is AI-generated and is identified that way in the interface. Computer commands enter a fixed action registry: arbitrary shell commands are rejected, browser destinations are limited to validated HTTP/HTTPS URLs, file access is contained to approved roots (including linked-path checks), and protected processes cannot be terminated. Email, social posting, credential access, arbitrary command execution, camera gestures, and screen capture are intentionally not enabled in this prototype.

## Hologram note

The interface creates simulated holographic visuals on a normal monitor using layered graphics, transparency, animation, and spatial presentation. Physical projections require separate AR, spatial-display, or holographic hardware.
