/**
 * Level objects at run time (§1.1 "Pályaobjektumok"): exits, water, lava, traps, teleporters and
 * bounce pads, checked for every active creature after it moved, in definition order (the first
 * object that acts on the creature wins). Entrances are handled by the spawner in `sim.ts`.
 *
 * A creature touches an object zone when its foot point (x, y) or the pixel above it (x, y − 1)
 * lies inside – so zones work both when drawn standing on the ground and when sunk into it.
 */

import { type Creature, CreatureState } from './creature';
import { startBounce } from './movement';
import { type LevelObject, type TeleportObject, objectRect } from './level';
import type { Rect } from './terrain';
import { type Sim, emit, killCreature, startExit, startFall } from './world';

/** A trap kills one creature, then needs this many ticks to re-arm. */
export const TRAP_RELOAD_TICKS = 180;

export function zoneHit(r: Rect, c: Creature): boolean {
  const { x, y } = c;
  // Foot point (x, y) or (x, y − 1) inside r; inlined for speed (hot path).
  return x >= r.x && x < r.x + r.w && y >= r.y && y - 1 < r.y + r.h;
}

/** Trigger zones of the objects (index-aligned with `objects`). */
export function objectZones(objects: readonly LevelObject[]): Rect[] {
  return objects.map(objectRect);
}

/** Index of the teleporter whose entry zone the creature is in, or −1. */
export function teleportZoneAt(sim: Sim, c: Creature): number {
  for (let i = 0; i < sim.objects.length; i++) {
    if (sim.objects[i]?.type === 'teleport' && zoneHit(sim.zones[i] as Rect, c)) return i;
  }
  return -1;
}

function teleport(sim: Sim, c: Creature, index: number, o: TeleportObject): void {
  c.x = o.tx;
  c.y = o.ty;
  // Any active skill (digging, building, bouncing) ends; permanent skills and the fuse stay.
  startFall(c);
  c.counter = 0;
  c.lastTeleport = teleportZoneAt(sim, c);
  emit(sim, { type: 'teleported', tick: sim.tick, id: c.id, object: index });
}

/** Whether a trap at `index` is armed at the current tick. */
export function trapArmed(sim: Sim, index: number): boolean {
  return sim.tick >= (sim.trapReadyAt[index] ?? 0);
}

/** Applies the first object acting on an active creature (call after it moved this tick). */
export function applyObjects(sim: Sim, c: Creature): void {
  let inTeleport = -1;
  const { objects, zones } = sim;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i] as LevelObject;
    if (o.type === 'entrance' || !zoneHit(zones[i] as Rect, c)) continue;
    switch (o.type) {
      case 'exit':
        startExit(sim, c, i);
        return;
      case 'water':
        killCreature(sim, c, 'water');
        return;
      case 'lava':
        killCreature(sim, c, 'lava');
        return;
      case 'trap':
        if (!trapArmed(sim, i)) continue;
        sim.trapReadyAt[i] = sim.tick + TRAP_RELOAD_TICKS;
        emit(sim, { type: 'trapFired', tick: sim.tick, id: c.id, object: i });
        killCreature(sim, c, 'trap');
        return;
      case 'teleport':
        if (c.lastTeleport === i || c.state === CreatureState.Warden) {
          inTeleport = i;
          continue;
        }
        teleport(sim, c, i, o);
        return;
      case 'bounce':
        if (
          c.state !== CreatureState.Walk &&
          c.state !== CreatureState.Fall &&
          c.state !== CreatureState.Glide
        ) {
          continue;
        }
        startBounce(c);
        emit(sim, { type: 'bounced', tick: sim.tick, id: c.id, object: i });
        return;
    }
  }
  c.lastTeleport = inTeleport;
}
