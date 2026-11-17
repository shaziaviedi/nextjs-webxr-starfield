import { Vector3 } from 'three';
import type { Player } from './Player';

// notify React about membership changes, not every pose update
export class PlayerRegistry {
  private players = new Map<string, Player>();
  private listeners = new Set<() => void>();
  private revision = 0;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.revision;

  private changed() {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  }

  register(player: Player) {
    if (this.players.has(player.id)) throw new Error(`Player "${player.id}" is already registered`);
    this.players.set(player.id, player);
    this.changed();
    // an old cleanup must not remove a newer registration
    return () => {
      if (this.players.get(player.id) === player) this.unregister(player.id);
    };
  }

  unregister(id: string) {
    const removed = this.players.delete(id);
    if (removed) this.changed();
    return removed;
  }

  get(id: string) {
    return this.players.get(id);
  }
  getAll(): readonly Player[] {
    return Array.from(this.players.values());
  }
  get size() {
    return this.players.size;
  }

  // copy into a reusable target when called every frame
  getWorldPosition(id: string, target = new Vector3()) {
    const player = this.players.get(id);
    return player ? target.copy(player.position) : undefined;
  }
}
