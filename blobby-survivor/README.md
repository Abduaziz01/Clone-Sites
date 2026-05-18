# Blobby Survivor

An original top-down auto-shooter inspired by the survivors-like genre. Survive endless waves of blob enemies, collect XP gems, and level up to pick from an evolving arsenal of weapons and passive boons.

## How to run

Just open `index.html` in any modern browser. No install. No build. No server. It works straight from `file://`. Tested in recent Chrome, Firefox, and Safari.

## Controls

- WASD or arrow keys to move
- Weapons fire automatically; aiming is handled for you
- 1, 2, or 3 to choose an upgrade card on the level-up screen (or click)
- Esc to pause and resume
- M to toggle mute
- Tab away or unfocus the window to auto-pause

## Tips

- Kite enemies in wide arcs rather than running straight: most blobs cap out slower than you, but they pack tightly.
- Pick up Halo Orbs early. The orbiting damage gives you a panic ring that buys time when you get crowded.
- Wide Pull (passive) is underrated. A bigger pickup radius means more XP per second and faster level-ups.
- The Husk mini-boss arrives every 2 minutes. Save a clear lane for it: Pulse Shard and Seeker Mote chip it down well, while Shockwave thins the swarm trailing behind.
- Damage stacks multiplicatively with cooldown reduction. Mixing Sharp Spirit and Quick Reflex outscales pure damage stacking after level 10.

## Tech notes

- Vanilla HTML, CSS, and JavaScript. No frameworks. No bundlers. No package manager.
- All art is drawn procedurally on a single Canvas 2D context. There are no images or sprite sheets.
- All sound is synthesized at runtime with the WebAudio API. There are no audio files.
- No external dependencies and no build step. The page runs as-is from disk.
- Source is split across small IIFE modules in `js/` that share a single `window.BS` namespace, loaded in dependency order via classic `<script>` tags.

## Credits

This is an original work by the project authors. It is not affiliated with, derived from, or endorsed by any other game.

Original weapon names used in this project:

- Pulse Shard
- Halo Orbs
- Shockwave
- Seeker Mote
- Snap Whip
- Rangboom

Original enemy names used in this project:

- Slime
- Runner
- Lurker
- Brute
- Husk (mini-boss)
