# Drift Protocol

A browser game about keeping a fragile starship alive: divide reactor power between systems,
direct your crew, and outrun the Warden fleet across five sectors to reach the gate. Real-time combat, with pause.
Plays with **mouse + keyboard** or a **game controller** (Xbox, PlayStation, Switch Pro, most USB/Bluetooth pads).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation unit tests
npm run build    # static site in dist/ (deploy anywhere)
```

## Controls

| | Mouse & keyboard | Controller |
|---|---|---|
| Pause (orders still work) | Space | Start |
| Select crew | Click crew / Tab | LB / RB, or A on a room |
| Move crew | Right-click a room | D-pad / stick to a room, A |
| Power a system | Click its bar (right-click: less) · A S D F (+Shift: less) | Y, then ◀ ▶ pick, ▲ ▼ power |
| Weapons | Click card or 1–4, then click an enemy room | X (again cycles), stick to a room, A |
| Drones | Click card or 5–6 (right-click / Shift: off) | Y, select it, ▲ / ▼ |
| Board (crew in the teleporter room) | T, then click an enemy room | X past the last weapon, then A |
| Recall boarders | R | Click left stick (L3) |
| Cloak | C | LT |
| Cancel | Right-click / Esc | B |
| Jump away | J | RT |
| Menu | Esc | Back / Select |
| Map: choose a beacon | Click it (or arrows + Enter) | D-pad / stick, A |
| Map: ship upgrades | U | Y |
| Map: distress signal (out of fuel) | Button on the map | X |

## Play online

Every push to the development branch builds and deploys to GitHub Pages
(see `.github/workflows/pages.yml`). Pages must be enabled once in the repository settings:
**Settings → Pages → Source: GitHub Actions**.

## How it plays

- **Four ships** in the hangar: Wayfarer (balanced), Bastion (shields and a guard drone),
  Corsair (boarding teleporter) and Shade (cloaking).
- **Reactor power** is limited. Every 2 power in Shields gives one shield layer; Engines give evasion
  and charge the jump drive; Oxygen keeps the air up; Medbay heals; weapons each need power.
- **Crew** in a room automatically fight fires, seal breaches and repair damage. Crew at Piloting,
  Engines, Shields and Weapons give bonuses, and Piloting must be manned to dodge or jump.
- **Weapons:** lasers are stopped by shields, missiles go through them (and use ammo),
  ion shots jam systems, and beams sweep across several rooms (each shield layer cuts their damage).
- **The run:** each sector is a map of linked beacons. Jumping costs 1 fuel, and the Warden fleet
  (the red tide) advances with every jump. Beacons hold fights, events with choices, or stores.
  Reach the exit to move to the next sector; the flagship guards the gate in sector 5.
- **Boarding:** crew standing in the teleporter room can be beamed onto the enemy ship, where they
  fight its crew and wreck systems. Kill the whole crew for bonus salvage. Enemies board you too.
- **Cloaking** gives a big evasion boost and freezes enemy weapon charging for a few seconds.
- **Drones** cost a drone part to launch: strike drones attack the enemy, guard drones shoot down
  incoming fire.
- **Saving:** the run auto-saves on the map; pick Continue on the title screen.
- **Scrap** from fights and events buys fuel, missiles, repairs, weapons and crew at stores, and
  system upgrades anywhere.

## Code layout

```
src/
  core/    game controller, unified action layer, sound, RNG
  run/     sector map generator, beacon events, run flow (stores, loot, upgrades), save/load
  input/   gamepad polling (keyboard/mouse are wired in core/game.ts + main.ts)
  sim/     ship, rooms, power, crew pathfinding, oxygen/fire/breach, combat, enemy AI
  render/  canvas renderer (ships, effects, background)
  ui/      HTML HUD, menus, icons
  data/    systems, weapons, ship layouts (plain data, easy to tweak)
```

The simulation in `src/sim` has no DOM dependencies and is covered by `tests/`.

## Roadmap

- [x] M1 skeleton, game loop, unified input (keyboard, mouse, gamepad)
- [x] M2 ship sim: rooms, doors, crew, power, oxygen
- [x] M3 combat: weapons, shields, evasion, fires, breaches, repairs, enemy AI, win/lose
- [x] M4 beams, more weapons and enemy types, final boss
- [x] M5 sector map, beacon events, stores, fuel, pursuing fleet
- [x] M6 hangar with four ships, autosave and continue, generated music, settings
- [x] M7 teleporter and boarding (both sides), drones, cloaking, systems installable at stores
