# Plan: Enemy HP Bars + Floating Damage Numbers

## What this changes and why

Players currently have no visual feedback on how much damage they're dealing or how
much HP each enemy has remaining. This makes it impossible to develop intuition for
build decisions ("is Rapid Fire better than Overcharge against this enemy?"). Adding
HP bars above enemies and floating damage numbers at hit locations closes this feedback
loop and also makes the balance simulator's numbers feel concrete during playtesting.

---

## Design decisions

| # | Decision | Chosen |
|---|----------|--------|
| 1 | HP bar position | 6 px above each enemy sprite's top edge; bar width = enemy texture width |
| 2 | HP bar height | 4 px |
| 3 | HP bar colour | Green → yellow → red (same thresholds as player HP) |
| 4 | HP bar background | 0x1a1a1a, full width |
| 5 | Damage number position | Hit point (enemy x, y) offset by (±8 px random, −20 px start) |
| 6 | Damage number colour | Cyan `#00ffff` for normal; yellow `#ffff00` for overcharge/crit |
| 7 | Damage number animation | Rise 40 px over 600 ms, fade out, then destroy |
| 8 | Boss HP bar | Already exists — no change |
| 9 | Implementation | HP bars drawn via a persistent `Graphics` object cleared each frame (follows enemy position); damage numbers are individual `Text` objects tweened then destroyed |

---

## HP bar rendering

The `updateEnemyHpBars()` method is called every frame in `update()`. It clears and
redraws all active enemy HP bars using one `enemyHpGfx: Graphics` object:

```typescript
private updateEnemyHpBars(): void {
  this.enemyHpGfx.clear();
  for (const obj of this.enemies.getChildren()) {
    const e = obj as unknown as EnemySprite;
    if (!e.active || e.enemyType === 'boss') continue;  // boss has its own bar
    const ratio = Math.max(0, e.hp / (e.maxHp ?? e.hp));  // maxHp fallback
    const barW  = e.displayWidth;
    const x     = e.x - barW / 2;
    const y     = e.y - e.displayHeight / 2 - 8;
    const color = ratio > 0.5 ? 0x00ee00 : ratio > 0.25 ? 0xeeee00 : 0xee2200;
    this.enemyHpGfx.fillStyle(0x1a1a1a, 1); this.enemyHpGfx.fillRect(x, y, barW, 4);
    this.enemyHpGfx.fillStyle(color, 1);    this.enemyHpGfx.fillRect(x, y, barW * ratio, 4);
  }
}
```

`maxHp` is set on spawn for all enemies (currently only boss has it). Every enemy spawn
call needs `e.maxHp = e.hp` added.

---

## Floating damage numbers

`spawnDamageNumber(x, y, amount, isCrit)` creates a Text object and tweens it:

```typescript
private spawnDamageNumber(x: number, y: number, amount: number, isCrit = false): void {
  const label = isCrit ? `${amount}!` : `${amount}`;
  const color = isCrit ? '#ffff00' : '#00ffff';
  const txt   = this.add.text(
    x + Phaser.Math.Between(-8, 8), y - 10, label,
    { fontSize: '12px', color, fontFamily: 'monospace', fontStyle: isCrit ? 'bold' : 'normal' },
  ).setDepth(8).setOrigin(0.5);

  this.tweens.add({
    targets: txt, y: txt.y - 40, alpha: 0,
    duration: 600, ease: 'Power1',
    onComplete: () => txt.destroy(),
  });
}
```

Called from `damageEnemy()` — one call per hit, showing rounded damage.

---

## Data model change

`maxHp` is already optional on `EnemySprite` (`maxHp?: number`). All enemy spawn
calls need `e.maxHp = e.hp` added (boss already has this; stars and circles do not).

---

## Complexity analysis

- `updateEnemyHpBars()`: O(E) — one Graphics rect pair per active enemy. Max ~12 enemies.
- `spawnDamageNumber()`: O(1) — creates one Text + one Tween. Object is self-destroying.
- No collection growth: damage numbers tween to alpha=0 and call `destroy()`.

---

## Files touched

| File | Change |
|------|--------|
| `src/scenes/GameScene.ts` | Add `enemyHpGfx` field; `buildEnemyHpGfx()` in `create()`; `updateEnemyHpBars()` in `update()`; `spawnDamageNumber()` helper; add `e.maxHp = e.hp` to all star/circle spawns; call `spawnDamageNumber` from `damageEnemy()` |

No new files. No type changes (`maxHp` already on `EnemySprite`).

---

## Test plan

- [ ] Battle star HP bar appears above it on spawn (green, full)
- [ ] HP bar shrinks and turns yellow then red as star takes damage
- [ ] HP bar disappears when enemy is destroyed
- [ ] Boss does NOT get a second HP bar (existing bar unchanged)
- [ ] Cyan "+10" text rises from hit point and fades over 600 ms
- [ ] Overcharge hit shows yellow "30!" in bold
- [ ] Multiple simultaneous hits each spawn their own number (no overlap issues)
- [ ] Damage numbers don't accumulate — all destroyed after tween
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Performance**
- [ ] `updateEnemyHpBars()` is O(E), max 12 enemies — acceptable
- [ ] No Text object leak — `onComplete: () => txt.destroy()` on every number

**Readability**
- [ ] `spawnDamageNumber()` ≤ 15 lines
- [ ] `updateEnemyHpBars()` ≤ 15 lines

**CI**
- [ ] `typecheck` passes
