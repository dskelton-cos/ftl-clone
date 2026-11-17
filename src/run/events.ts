export interface Effects {
  scrap?: number;
  fuel?: number;
  missiles?: number;
  droneParts?: number;
  hull?: number;
  crewHp?: number; // applied to every crew member (never fatal)
  newCrew?: boolean;
  weapon?: boolean; // a random weapon
  upgrade?: boolean; // a random system +1
  fleet?: number; // shift the pursuing fleet (negative = delay)
}
export interface Outcome { weight?: number; text: string; effects?: Effects; fight?: boolean }
export interface Choice { label: string; require?: { scrap?: number; fuel?: number; missiles?: number }; outcomes: Outcome[] }
export interface EventDef { id: string; title: string; text: string; choices: Choice[] }

const leave: Choice = { label: 'Move on', outcomes: [{ text: 'You leave it behind.' }] };

export const EVENTS: EventDef[] = [
  {
    id: 'derelict', title: 'Tumbling Freighter',
    text: 'A gutted freighter spins slowly, its cargo doors blown open. Nothing answers your hails.',
    choices: [
      { label: 'Send a team to search it', outcomes: [
        { weight: 3, text: 'Your team returns hauling crates of salvage and a few intact missiles.', effects: { scrap: 22, missiles: 2 } },
        { weight: 2, text: 'A bulkhead gives way mid-search. Your team limps back with a handful of scrap.', effects: { scrap: 8, crewHp: -25 } },
      ] },
      leave,
    ],
  },
  {
    id: 'pod', title: 'Looping Distress Call',
    text: 'An escape pod drifts near the beacon, broadcasting the same garbled message over and over.',
    choices: [
      { label: 'Pull the pod aboard', outcomes: [
        { weight: 5, text: 'A half-frozen engineer climbs out and asks to join your crew.', effects: { newCrew: true } },
        { weight: 3, text: 'The pod is empty, but its fuel cells are still charged.', effects: { fuel: 3 } },
        { weight: 2, text: 'It was bait. A raider drops out of the dark, guns hot.', fight: true },
      ] },
      leave,
    ],
  },
  {
    id: 'toll', title: 'Toll Collector',
    text: 'A heavily armed cutter blocks your path. "This lane belongs to us. Twenty scrap, or we take it from your wreck."',
    choices: [
      { label: 'Pay 20 scrap', require: { scrap: 20 }, outcomes: [{ text: 'They count it twice and wave you through.', effects: { scrap: -20 } }] },
      { label: 'Refuse', outcomes: [{ text: '"Wrong answer." Their weapons spin up.', fight: true }] },
    ],
  },
  {
    id: 'storm', title: 'Ion Squall',
    text: 'A wall of crackling ion static rolls across the beacon. Riding its edge would shake off pursuit, but it will rattle the hull.',
    choices: [
      { label: 'Ride the storm', outcomes: [{ text: 'Plating buckles and alarms scream, but the fleet loses your trail.', effects: { hull: -3, fleet: -1 } }] },
      { label: 'Wait it out', outcomes: [{ text: 'You hold position until it passes. The fleet draws closer.', effects: { fleet: 0.5 } }] },
    ],
  },
  {
    id: 'cache', title: 'Sealed Weapons Cache',
    text: 'A smuggler\'s cache floats inside a ring of dormant defense turrets.',
    choices: [
      { label: 'Crack it open', outcomes: [
        { weight: 1, text: 'The turrets stay dark. Inside: a working weapon, still in its crate.', effects: { weapon: true } },
        { weight: 1, text: 'The turrets wake up. A guard drone platform moves to intercept.', fight: true },
      ] },
      leave,
    ],
  },
  {
    id: 'asteroid', title: 'Rich Asteroid',
    text: 'Sensors show a dense vein of refined metal in a slow-moving asteroid.',
    choices: [
      { label: 'Mine it', outcomes: [
        { weight: 3, text: 'Hours of hard work pay off in a hold full of ore.', effects: { scrap: 26 } },
        { weight: 1, text: 'A fragment cracks loose and slams into the hull, but you get most of the ore.', effects: { scrap: 18, hull: -4 } },
      ] },
      { label: 'Skip it, time is short', outcomes: [{ text: 'You push on before the fleet closes in.', effects: { fleet: -0.4 } }] },
    ],
  },
  {
    id: 'refugees', title: 'Refugee Barge',
    text: 'A crowded barge is running on fumes. Their captain begs for fuel.',
    choices: [
      { label: 'Share 2 fuel', require: { fuel: 3 }, outcomes: [
        { weight: 1, text: 'A pilot among them volunteers to join you as thanks.', effects: { fuel: -2, newCrew: true } },
        { weight: 1, text: 'They press what scrap they have into your hands.', effects: { fuel: -2, scrap: 18 } },
      ] },
      leave,
    ],
  },
  {
    id: 'smuggler', title: 'Quiet Trader',
    text: 'A trader with no transponder offers missiles. "No questions, fair price."',
    choices: [
      { label: 'Buy 5 missiles for 12 scrap', require: { scrap: 12 }, outcomes: [{ text: 'The crates are exactly as promised.', effects: { scrap: -12, missiles: 5 } }] },
      { label: 'Trade 3 missiles for 3 fuel', require: { missiles: 3 }, outcomes: [{ text: 'A fair swap.', effects: { missiles: -3, fuel: 3 } }] },
      leave,
    ],
  },
  {
    id: 'relay', title: 'Warden Relay',
    text: 'An unmanned Warden communications relay hangs at the beacon.',
    choices: [
      { label: 'Feed it false coordinates', outcomes: [
        { weight: 3, text: 'The fleet takes the bait and turns away for a while.', effects: { fleet: -1.2 } },
        { weight: 1, text: 'The relay sees through it and calls a nearby patrol.', fight: true },
      ] },
      { label: 'Strip it for parts', outcomes: [{ text: 'You pry loose a good amount of salvage.', effects: { scrap: 16, fleet: 0.3 } }] },
    ],
  },
  {
    id: 'dock', title: 'Drifting Repair Dock',
    text: 'An automated repair dock still has power. Its menu blinks a list of services.',
    choices: [
      { label: 'Patch the hull (15 scrap)', require: { scrap: 15 }, outcomes: [{ text: 'Drones swarm over your ship, sealing every crack they can find.', effects: { scrap: -15, hull: 8 } }] },
      { label: 'Install an upgrade (30 scrap)', require: { scrap: 30 }, outcomes: [{ text: 'The dock retrofits one of your systems.', effects: { scrap: -30, upgrade: true } }] },
      leave,
    ],
  },
  {
    id: 'ambush', title: 'Silent Beacon',
    text: 'The beacon is quiet. Too quiet: a ship has its engines cold, waiting.',
    choices: [{ label: 'Battle stations', outcomes: [{ text: 'It powers up and charges straight at you.', fight: true }] }],
  },
  {
    id: 'dronefield', title: 'Drone Graveyard',
    text: 'Hundreds of dead drones drift around a burnt-out carrier. Some still twitch.',
    choices: [
      { label: 'Salvage parts', outcomes: [
        { weight: 3, text: 'You fill a cargo bay with usable drone components.', effects: { droneParts: 4 } },
        { weight: 1, text: 'A swarm reactivates and slams into your hull before you pull away.', effects: { droneParts: 2, hull: -3 } },
      ] },
      leave,
    ],
  },
  {
    id: 'mutiny', title: 'Mutiny in Progress',
    text: 'A freighter crew is fighting its own officers over the comms. One side begs you to beam over and help.',
    choices: [
      { label: 'Side with the crew', outcomes: [
        { weight: 2, text: 'The officers surrender. The grateful crew hand over their pay chest and one of them signs on with you.', effects: { scrap: 15, newCrew: true } },
        { weight: 1, text: 'The officers seal the bulkheads and turn the ship\'s guns on you.', fight: true },
      ] },
      leave,
    ],
  },
  {
    id: 'clinic', title: 'Field Clinic',
    text: 'A medical frigate offers treatment to any crew that need it.',
    choices: [
      { label: 'Accept treatment', outcomes: [{ text: 'Your crew return patched up and rested.', effects: { crewHp: 100 } }] },
      { label: 'Donate 10 scrap', require: { scrap: 10 }, outcomes: [{ text: 'They thank you with spare fuel and treat your crew.', effects: { scrap: -10, fuel: 2, crewHp: 100 } }] },
    ],
  },
];
