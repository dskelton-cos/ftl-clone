import type { WeaponKind } from './weapons';

export interface DroneDef {
  id: string;
  name: string;
  kind: 'strike' | 'guard';
  power: number;
  rate: number; // seconds between shots
  damage: number; // strike drones
  targets: WeaponKind[]; // guard drones: projectile kinds it shoots down
  price: number;
  desc: string;
}

export const DRONES: Record<string, DroneDef> = {
  strike: { id: 'strike', name: 'Strike Drone', kind: 'strike', power: 2, rate: 5, damage: 1, targets: [], price: 50, desc: 'Circles the enemy and fires a laser bolt every few seconds.' },
  lancer: { id: 'lancer', name: 'Lancer Drone', kind: 'strike', power: 3, rate: 6.5, damage: 2, targets: [], price: 75, desc: 'Heavier strike drone. Each bolt deals 2 damage.' },
  guard: { id: 'guard', name: 'Guard Drone', kind: 'guard', power: 2, rate: 1.3, damage: 0, targets: ['missile'], price: 45, desc: 'Shoots down incoming missiles.' },
  aegis: { id: 'aegis', name: 'Aegis Drone', kind: 'guard', power: 3, rate: 1.6, damage: 0, targets: ['missile', 'laser', 'ion'], price: 70, desc: 'Shoots down missiles, laser bolts and ion shots.' },
};
