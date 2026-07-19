import Phaser from 'phaser';

/**
 * A small, destroy-safe collection for the "batch of GameObjects rebuilt from scratch
 * on every state change" lifecycle that recurs across this codebase's overlays and
 * panels (CombatScene's exit-confirm modal and narrator modal, CardOverlay, HubTour,
 * HubScene's content panels). `removeInteractive()` before `destroy()` matters: a
 * destroyed but still-registered-interactive object can keep swallowing taps meant for
 * whatever gets built in its place.
 */
export class ManagedObjectGroup {
  private objects: Phaser.GameObjects.GameObject[] = [];

  /** Adds and returns `obj` unchanged — mirrors the existing `addC<T>(obj: T): T`
   * ergonomic (push-and-return-for-chaining) every migrated call site already used. */
  add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj);
    return obj;
  }

  get length(): number {
    return this.objects.length;
  }

  /** Destroy-safe and idempotent: calling this on an already-empty group (or twice in
   * a row) is a no-op, matching every hand-rolled lifecycle this replaces. */
  destroyAll(): void {
    this.objects.forEach((obj) => { obj.removeInteractive(); obj.destroy(); });
    this.objects = [];
  }
}
