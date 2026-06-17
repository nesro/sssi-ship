# INFO tab — Settings · About · Manual

## What this changes and why

Adds a third top-level tab (MISSIONS | SHOP | **INFO**) to MenuScene. It hosts three
vertically-scrollable sections: Settings (audio toggles), About (maturita-thesis blurb
from v1), and Manual (gameplay primer). The motivation is that a first-time player has
no in-game explanation of the generator → shield cycle, the star gate, or how to
progress — they currently have to infer everything or read external docs.

## Design decisions requiring confirmation

1. **Two audio toggles vs one.** Currently there is one mute button that silences
   everything. The user asked for separate Music on/off and SFX on/off.
   - Proposed: two `localStorage` keys — `'nesro-nova-v2-music-muted'` and
     `'nesro-nova-v2-sfx-muted'`. `SoundManager` gains `isMusicMuted()` / `toggleMusic()`
     and `isSfxMuted()` / `toggleSfx()` methods. `fire()`, `kill()`, etc. check
     `isSfxMuted()` before playing. The existing single mute key is **replaced** (old
     saves get default = all on).
   - **Requires confirmation:** accept breaking the single mute key?

2. **About text source.** The v1 `phaser/` tree presumably has an About panel or a
   README with the maturita-thesis paragraph. If you paste it here I'll copy it verbatim;
   otherwise I'll read `../phaser/` and extract it.

3. **Manual format.** Options:
   - **(a) Scrollable text** — a Phaser `DOMElement` textarea or a long `Text` with
     camera-sub-scroll. Simpler to implement but no native mobile momentum scroll.
   - **(b) Paged sections** — SETTINGS / ABOUT / MANUAL as sub-tabs inside INFO.
     Cleanest UX, fits portrait layout without scrolling.
   - **Recommended: (b) sub-tabs.** Three pill buttons at the top of the INFO panel;
     each shows its section below. No scroll needed.

4. **Manual content scope.** Proposed sections:
   - How the generator and shield cycle works (pulse mechanic)
   - How weapons, energy, and the brownout slope work
   - Shop: buy → equip flow, live preview, supplies
   - Missions: star gate, tutorial vs combat missions
   - How to win: farm stars → unlock all missions → earn all stars

5. **INFO tab placement.** The top bar currently has two buttons at `cx ± 70`. Adding a
   third shifts them to `cx − 130`, `cx`, `cx + 130` (evenly spaced at ~90 px apart).

## Complexity analysis

- O(1) — all text is static; no loops over game data.
- No impact on core, simulator, or save format (except audio key migration).

## Test plan

- [ ] MISSIONS / SHOP / INFO tabs switch correctly; active tab highlighted
- [ ] Settings: toggling Music mutes/unmutes background track; SFX toggle silences fire/kill sounds
- [ ] Settings toggles persist across page reload
- [ ] About section shows the maturita-thesis text
- [ ] Manual section shows all five content sections
- [ ] On a 540×820 viewport no text is clipped

## File hygiene

- No hardcoded paths planned.
- Old `'nesro-nova-v2-muted'` localStorage key must be cleaned up (removed from
  `SoundManager` and documented in HANDOFF_TO_HUMAN).

---

### Checklist

**Design decisions**
- [ ] Design decisions confirmed by user (audio key migration, About text source, sub-tab layout)
- [ ] Test plan approved by user

**Guardrails**
- [ ] Every opt-out guard uses `=== false`, not `!value`
- [ ] No swallowed exceptions

**Performance**
- [ ] All loops O(1) or O(small-constant)

**Readability**
- [ ] No function exceeds 100 lines
- [ ] No magic strings — localStorage keys in named constants

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
