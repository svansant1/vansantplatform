# SVANS Holographic Desktop

An isolated Windows desktop prototype for the SVANS conversational and holographic interface. It does not replace the production SVANSAI or Vansant Platform applications.

## What is working

- Frameless Electron command deck
- Windows tray presence and `Ctrl+Space` show/hide shortcut
- Always-on-top control
- Compact ambient-orb mode
- Live CPU, memory, uptime, host, processor, and network telemetry
- Animated holographic core, orbital controls, particle field, and voice spectrum
- Real SVANSAI conversation bridge through `https://svansai.com/api/chat`
- Browser speech recognition when supported by the installed Electron/Chromium build
- Spoken responses through Windows/Chromium speech synthesis
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

The renderer does not have Node.js access. It communicates through a narrow preload bridge. External navigation is restricted to an allowlist, and the interface models local capabilities as permissioned actions. File access, email, social posting, camera gestures, and screen context are intentionally not enabled in this prototype.

## Hologram note

The interface creates simulated holographic visuals on a normal monitor using layered graphics, transparency, animation, and spatial presentation. Physical projections require separate AR, spatial-display, or holographic hardware.
