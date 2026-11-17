# Drift Protocol

A browser game about keeping a fragile starship alive: divide reactor power between systems,
direct your crew, and fight off the ships hunting you. Real-time, with pause.
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
| Cancel | Right-click / Esc | B |
| Jump away | J | RT |
| Menu | Esc | Back / Select |

## How it plays

- **Reactor power** is limited. Every 2 power in Shields gives one shield layer; Engines give evasion
  and charge the jump drive; Oxygen keeps the air up; Medbay heals; weapons each need power.
- **Crew** in a room automatically fight fires, seal breaches and repair damage. Crew at Piloting,
  Engines, Shields and Weapons give bonuses, and Piloting must be manned to dodge or jump.
- **Weapons:** lasers are stopped by shields, missiles go through them (and use ammo),
  ion shots jam systems.
- Win a fight to salvage scrap, then spend it on repairs, missiles and upgrades before jumping on.

## Code layout

```
src/
  core/    game flow, unified action layer, sound, RNG
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
- [ ] M4 beams, more weapons and enemy types
- [ ] M5 sector map, beacon events, shops, pursuit
- [ ] M6 polish: hangar, saving, more audio
- [ ] M7 boarding, drones, teleporter, cloaking
