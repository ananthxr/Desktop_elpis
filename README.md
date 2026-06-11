# 🐱 Pixel — Reactive Desktop Cat

A tiny, classic **neko-style pixel cat** that lives on top of your desktop and
reacts to everything you do. It **walks and wanders, faces your cursor, sits,
grooms, lies down to sleep**, and does little acrobatic jumps when startled.
Pet it, bop it, drag it around — and it always stays on top.

The cat is animated from a **32×32 sprite sheet** (`src/renderer/sheet.png`,
8 columns × 10 rows), sliced into animation clips in code.

## Run

```bash
npm install
npm start
```

It lives in the **system tray** (look for the kitten icon). Right-click the tray
icon to **Show/Hide the cat** (`Ctrl+Alt+C`), set **Size** (Small/Medium/Large) and
**Position** (corner), Pause reactions, Mute sounds, Bring the cat to you,
Start-with-Windows, or Quit. Your size and position choices are remembered between
restarts.

**Global shortcut:** press **`Ctrl+Alt+C`** anytime to instantly hide or show the
cat (works from any app).

The cat stays **on top of everything** — it re-asserts its topmost position so newly
opened or fullscreen windows don't cover it.

## What it reacts to

| You do…                     | Pixel does…                                      |
|-----------------------------|--------------------------------------------------|
| Move the mouse              | turns to face your cursor                        |
| Type                        | sits at a little **keyboard and taps 2 keys** with its paws (faster as you type faster) |
| Right-click (anywhere)      | startled jump                                    |
| Arrow ← / →                 | **walks** that direction (no up/down)            |
| `Alt+F4` / `Ctrl+W`         | sits up + `bye~`                                 |
| Open email (Outlook/Gmail…) | meows with a letter ✉ + hearts                   |
| Leave it alone (~30s)       | lies down and sleeps `z z z`                     |
| On its own                  | wanders left/right, grooms, meows                |
| **Click the cat**           | **pet** (meow + hearts 💕) — spam-click = **bop** (jump + stars ✨, then runs off) |
| **Right-click the cat**     | happy meow                                       |
| **Drag the cat**            | pick it up & move it anywhere (becomes its new home) |

Petting raises its **mood/affection**; bopping lowers it.

## Tweak it

- **Swap the art:** replace `src/renderer/sheet.png` (keep the 32×32, 8×10 grid).
- **Re-map animations:** edit the `CLIPS` table near the top of `src/renderer/cat.js`
  (each clip = `{ row, c0, n, fps, loop }`).
- **Behavior/speed/timers:** the behavior engine is all in `src/renderer/cat.js`.

## How it works

| File                       | Role                                                         |
|----------------------------|--------------------------------------------------------------|
| `src/main.js`              | overlay window, global input hooks, tray, foreground watcher |
| `src/preload.js`           | secure `catApi` bridge (contextIsolation)                    |
| `src/renderer/cat.js`      | sprite-sheet clips, movement, mood, particles, sounds, loop  |
| `src/renderer/sheet.png`   | the 32×32 cat sprite sheet                                   |

- **Overlay:** transparent, frameless, always-on-top, `focusable:false`,
  click-through everywhere except on the cat (hit-test toggles mouse capture).
- **Global input:** [`uiohook-napi`](https://www.npmjs.com/package/uiohook-napi)
  (mouse/keyboard/scroll, system-wide).
- **Email detection:** [`active-win`](https://www.npmjs.com/package/active-win)
  polls the foreground window (gracefully disabled if unavailable).

## Notes
- Windows 11. Coordinates are DPI-corrected via the display scale factor.
- Sounds are soft WebAudio blips, off via the tray "Mute" item.

