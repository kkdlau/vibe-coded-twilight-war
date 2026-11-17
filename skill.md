# 光暈戰記 (Twilight Wars) — Repository Skill & Architecture Guide

This document is the authoritative onboarding and technical reference for Agents working in this repository.

---

## 1. Project Overview & Runtime Environment

- **Game**: *光暈戰記 (Twilight Wars)* — single-mode 2D top-down 2.5D tactical arena shooter built with React 19, TypeScript, Tailwind CSS v4, HTML5 Canvas 2D, and Web Audio API.
- **Dev Server & Build**:
  - Runs on Vite + TypeScript (`npm run dev` on port `3000` with HMR disabled via `DISABLE_HMR`).
  - Type check: `npm run lint` (`tsc --noEmit`).
  - Tests: `npm test -- --run` (Vitest unit & integration suite in `src/game/engine.test.ts`).
  - Production build: `npm run build`.
- **Persistence**: LocalStorage only (`twilight_wars_records_v1` for match history, `twilight_wars_reputations_v1` for independent per-faction reputations initialized to `{ royal: 0, shadow: 0, mercenary: 0 }`).
- **UI/Environment Rules**:
  - Avoid `window.alert` / `window.open`.
  - Keep HUD/UI clean without telemetry/debug logs.
  - All user-facing copy is in Traditional Chinese (`zh-Hant`).

---

## 2. Codebase Map

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Top-level view router (`lobby` → `faction` → `battle`), persistent `RunRecord[]` & `Record<FactionId, number>` reputations. |
| `src/components/PortalView.tsx` | Minimalist triangular 3-faction lobby (Royal top-left, Shadow top-right, Mercenary bottom-center) + bottom-right 5-tab Help modal acting as a live visual debug booklet (`地形物件` split into `一、地形` & `二、物件` via live Canvas previews / `地圖` / `武器` / `角色` / `玩法`). |
| `src/components/FactionRoomView.tsx` | Single-viewport zero-scroll faction staging cockpit: 5 character skins, full 4-skill overview (`knife`, `claw`, `greatsword`, `shield`), map dropdown (`random` hides preview; named maps show `MiniMapPreview`), prominent reputation & launch CTA. |
| `src/components/MiniMapPreview.tsx` | Zoomable/scrollable live Canvas preview of any selected `MapId` showing terrain + color-aligned faction spawns (`royal` white/sky, `shadow` deep purple-crimson `#9D174D`, `mercenary` amber `#F59E0B`). |
| `src/components/GameCanvasView.tsx` | Game loop (`requestAnimationFrame`), keyboard/mouse input normalization, dual-ring HP/Qi HUD, timed skill cooldown boxes, top-right dual-hand weapon UI (ammo/shield durability displayed only beneath the active hand), `[Tab]` match progress, `[P]` pause, victory/defeat modal. |
| `src/components/WeaponArt.tsx` | Crisp SVG artwork for all 8 weapons, 12 character skin styles, 3 faction crests, and 6 timed skill icons. |
| `src/game/types.ts` | Canonical TypeScript interfaces for factions, shared dual-hand weapons (`EquippedWeapon`), player, AI (`EnemyEntity`), terrain, projectiles, pickups, and `HudSnapshot`. |
| `src/game/data.ts` | Faction definitions (`FACTIONS`), 15 character skins (`FACTION_CHARACTERS`), 7-map catalog (`MAP_CATALOG`), `GUNS`, `MELEES`, `getWeaponSwapDuration`, `getReputationQiMultiplier`, and `ORIGIN_RESEARCH`. |
| `src/game/tuning.ts` | Centralized combat & feel constants: `PLAYER_MOVEMENT`, `GUN_AIM` + `getGunSpread` distance-eased spread curves, `RELOAD_CUES`, `GUNFIRE_ANIMATION_SECONDS`, `RESPAWN_DELAY_SECONDS`, `AI_COMBAT`, `AI_PATROL`. |
| `src/game/maps.ts` | Tile-based (`TILE = 48`) procedural builders for all 7 maps, BFS/layout helpers, water/bridge definitions, elevation grids, crates, walls (`elevation = 10`), bamboo, trees, bushes, weapon/ammo/shield spawns. |
| `src/game/mapRenderer.ts` | Canvas 2D Floor & Object renderer (`renderMapBaseLayer`, `renderMapCanopies`), plus `renderHelpPreview` for exact proportion Help debug cards; tile water shore blending, stone/wood lighting, and proximity canopy transparency. |
| `src/game/geometry.ts` | Pure math, 8-way snapping (`snapToEightDirections`), collision primitives (`resolveCircleRect`, `segmentCircleHit`), faction hostility (`areHostile`), and radius constants. |
| `src/game/combatRenderer.ts` | Canvas 2D entity, pickup, weapon-in-hand, melee animation, VFX, muzzle flash, and crosshair renderer (`drawCharacter`, `drawPickup`, `drawSlashEffect`, `drawProjectiles`, `drawCrosshair`, etc.). |
| `src/game/engine.ts` | `TwilightEngine` core simulation: A* pathfinding, 2.5D movement/LoS/bullet tracing, combat/skills, screen flashbang fade, AI decision/patrol, pickups, wave spawning, respawn flow, and HUD snapshots. |
| `src/audio/sfx.ts` | Web Audio API sound engine (`SoundEngine` singleton `sfx`): loads `public/assets/audio/pistol-shot.wav` with per-gun filtering/pitch, plus procedural footsteps, phased reload clacks, melee charge hum, and death/respawn cues. |
| `src/game/engine.test.ts` | Comprehensive Vitest suite covering reputation math, faction deployment, reloads, 2.5D elevation/bullet blocking, map invariants, 0-damage shield mechanics, skills, unified Player/AI dual-hand parity, respawn, flashbang, rifle bloom, and AI patrol. |

---

## 3. Core Game Systems & Non-Obvious Invariants

### A. Factions, Hostility & Independent Reputation
- **Factions (`FactionId`)**:
  - `'royal'` (皇家騎士團): White character nameplates; allies with other `'royal'` units; hostile to `'shadow'` & `'mercenary'`.
  - `'shadow'` (天影十字軍): Deep purple-crimson nameplates (`#6E146B` in canvas / `#C026D3` in UI); allies with other `'shadow'` units; hostile to `'royal'` & `'mercenary'`.
  - `'mercenary'` (第三勢力／傭兵團): Brown nameplates (`#92400E`); **free-for-all** (`areHostile` returns `true` for everyone else, including other `'mercenary'` units).
- **Zero Faction Passives & Unified 100 HP**:
  - Both Player and AI start with **`100` max HP (`maxHp = 100`)** across all 3 factions.
  - Factions have **no passive stat modifiers** (no passive armor, speed bonus, damage multiplier, crit, or passive lifesteal). All tactical advantages come strictly from weapon choice and active Qi skills.
- **10-Soldier Deployment Cap & Independent Player Lives**:
  - Each faction deploys `10` total AI soldiers per match, capped at `2` active units on the field per faction (`deploymentQueue` refills every `0.65s`).
  - Player's `3` personal lives are **independent** of AI `deploymentQueue`: player respawn (`2.5s`) does **not** decrement `deploymentQueue[player.faction]`. While the player is `RESPAWNING`, `1` field slot in `player.faction` stays reserved (`reservedSlot = 1`) so an ally doesn't take the player's spot before respawn.
- **Reputation & Qi Speed**:
  - Killing `'royal'`/`'shadow'` enemy: `+1` own faction rep, `-1` victim faction rep.
  - Killing `'mercenary'` enemy: `+1` own faction rep, **never** deducts `'mercenary'` rep.
  - Friendly-fire kill by player: `-1` own faction rep.
  - Qi charge/regen multiplier (`getReputationQiMultiplier`): `0 -> 0.50×`, `10 -> 1.00×`, `100 -> 1.50×`, `1000 -> 2.00×` (`0.5 + 0.5 * log10(max(1, rep))`, clamped at `0.5` for `<= 0`).
  - AI soldiers always operate at a fixed reputation of **`100`** (`AI_FIXED_REPUTATION = 100`, `1.50×` Qi multiplier).

### B. Unified Dual-Hand Weapon Model (`[0, 1]`), Ammo & Shield Rules
- **Shared Dual-Hand Model (`weapons: [EquippedWeapon, EquippedWeapon]`)**:
  - Both `PlayerState` and `EnemyEntity` use identical weapon slot state: `activeHand: WeaponHand` (`0 | 1`), `weapons: [EquippedWeapon, EquippedWeapon]`, `swapTimer`, `swapDuration`, inline `ammoInMag` / `reloadTimer` on guns, inline `durability` on shields, and shared `dropWeapon` on death/swap.
  - Fixed default weapons per hand on spawn, respawn, and `[Esc]` drop: Hand `0 -> 制式小槍 (pistol)`, Hand `1 -> 戰術小刀 (knife)`.
  - `[Space]` replaces **only the currently active hand** with a nearby ground weapon (dropping non-default items back on the floor).
  - `[Esc]` drops a non-default weapon in the active hand and restores that hand's default (`0 -> pistol`, `1 -> knife`).
  - Death drops both non-default weapons on the ground for both players and AI.
  - **Q-Cancel Combo (Player)**: Switching within `0.02s–0.34s` after an attack cancels recovery cooldown, shortens swap rub animation (`0.45×`), and empowers the next attack (`+25%` damage).
  - **Top-Right HUD Display Rule**: Active hand is rendered lower-left/larger (`z-index` higher), off-hand is upper-right/thinner. Magazine/reserve ammo and shield durability are displayed **only beneath the active hand** (never for the off-hand).
- **Reserve Ammo (Only Player vs AI Gun Difference)**:
  - Player reserve ammo starts at `30` (max `45`, refilled by ground ammo pads).
  - **AI reserve ammo is infinite**: when an AI gun hits `0` in mag, it enters normal `def.reloadTime` and refills to full `def.magSize` from infinite reserve.
- **Semi-Auto Pistol & Rifle Continuous Shrink**:
  - **Pistol (`pistol`)**: Strictly **semi-automatic** (`fireRate: 2.4`, `0.417s` gap — no hold-to-autofire for player and paced interval for AI, significantly slower than `rifle`'s `8.5`/s). `shotgun` and `sniper` are also semi-automatic; only `rifle` auto-fires while holding left-click.
  - **Assault Rifle (`rifle`)**: Shares Pistol's distance curve (`{ near: 0.35, far: 1.75 }`) with rested crosshair strictly **`1.1×` Pistol** (`baseCrosshair: 12.1` vs `11`). Crosshair **continuously shrinks** every frame (`bloomRecovery: 20`) regardless of tiny movement, while firing (`bloomPerShot: 14`) or wide/fast cursor sweeps (`Math.min(18, Math.max(0, moveDist - 2) * 0.09)`) expand faster than recovery up to `maxCrosshair: 70`.
- **Tactical Ballistic Shield (`meleeKind: 'shield'`)**:
  - Classified strictly as a **Weapon / Equipment** (never as a Terrain or Object entry in Help or map geometry). Ground pickup is `kind: 'melee'` (`meleeDef.kind === 'shield'`), carrying preserved `durability` (`1–100`).
  - Blocks **only frontal incoming attacks** (`|angleDiff(defender.angle, incomingAngle)| <= Math.PI * 0.38`) while **actively held in hand**:
    - Bullets/ranged: absorbed `1:1` by durability (`-XX` floating deduction, no text prefix).
    - Melee: incoming damage halved (`0.5×`), blocked portion deducted from durability (`-XX` floating deduction, no text prefix).
  - **Zero Damage (Push-Only)**: Left-click shield bash knocks back + stuns targets while dealing strictly **`0` HP damage** (even `0`-dmg hits never trigger minimum HP clamps or consume enemy shield durability).
  - Durability `0` shatters the shield and reverts the hand to `knife`.

### C. Melee Qi Charging & 9+3 Skills (Player & AI Aligned)
- **Unified Qi Bar (`100 -> 0`)**:
  - Holding Left-Click / AI close-range melee charge drains `qi` from `100` to `0` at `115 * repMult` without slowing movement speed; regenerates at `24 * repMult`. Cast cooldown is `0.25s`, and timed skill durations/damage are identical for Player and AI.
  - **Shield (`shield`) — All Factions**: `護盾修復` restores held shield durability to `100` and emits a shockwave that knocks back & stuns nearby enemies with strictly **`0` HP damage**.
  - **Royal (`royal`)**:
    - `knife`: `聖光護盾` (`6.5s` ranged immunity, `-20%` melee damage taken; **breaks immediately if holder fires a gun**).
    - `claw`: `閃光瞬移` (teleports safely near nearest enemy + `0.5–1.0s` flash blind; **when cast by hostile Royal AI, blinds the Player** via `blindTimer`/`blindDuration` rendered as a full-screen sudden white flash that fades smoothly back to transparent).
    - `greatsword`: `聖光彈齊射` (5 yellow piercing orbs, `30` dmg; **does friendly fire** `noFriendlyFire: false`).
  - **Shadow (`shadow`)**:
    - `knife`: `鷹眼術` (`8.0s`, narrows gun spread `0.45×`; on Player, shifts camera ahead toward cursor without zooming out).
    - `claw`: `影分身` (`6.5s`, renders twin flanking afterimages, `2/3` ranged MISS; **immediately broken when hit by melee**).
    - `greatsword`: `黑龍波` (fires exclusively along the **8 cardinal/diagonal directions** `snapToEightDirections`; deep purple-indigo segmented dragon; head `20` dmg, body `15` dmg; bounces off walls/high cliffs/trees up to `5` bounces / `1050px` with equal **`1/3` probability of `+45°`, `0°`, or `-45°`** post-reflection rotation to prevent infinite same-path ping-ponging; `noFriendlyFire: true`).
  - **Mercenary (`mercenary`)**:
    - `knife`: `吸血術` (`7.5s` strictly; heals `50%` melee / `33%` ranged dmg dealt).
    - `claw`: `縮小化` (`7.5s`, `0.62×` scale, `+35%` melee damage taken).
    - `greatsword`: `巨人化` (`7.5s`, `1.32×` scale, `+30%` melee damage, `-10%` damage taken).

### D. 2.5D Grid Elevation, Floor/Object Layering, Help Debug Booklet & Clean Combat Visuals
- **Tile Size**: `TILE = 48px`, character base diameter = `1 * TILE` (`radius = 24px`).
- **Elevation Levels & Height `10` Solids**:
  - Floor terrain: `0.0` (ground / grass / water), stackable `hill` & cut-stone platforms (`每層 +1.0`: `1.0`, `2.0`, `3.0`), and matching `0.5 / 1.5 / 2.5` stairs.
  - **Standard Solid Height = `10`**: All solid walls (`stone_wall_*`, `shrine_wall`), marble pillars, houses, `bamboo` walls, and **`1×1` trees (`map.trees`)** share **`elevation = 10`** (`isWall = true`), blocking movement, bullets, Black Dragon Wave, and line of sight.
- **Floor Layer vs. Object Layer (Transparent Grounding & Help Debug Booklet)**:
  - **地形 (`TERRAIN_GUIDE_ITEMS`)**: `一般平地` (`0.0`), `青綠草坪平地` (`0.0`), `河道與泥岸` (`0.0`, non-walkable), stackable `土丘高地` (`每層 +1.0`) + `土坡階梯` (`0.5 / 1.5`), stackable `切石高台` (`每層 +1.0`) + `切石石階` (`0.5 / 1.5 / 2.5`).
  - **物件 (`OBJECT_GUIDE_ITEMS`)**: `跨河木橋` (`0.0`), `鐵道路軌` (`0.0`), `木條階梯踏台` (`0.5`), `小木箱` (`1.0`), `大木箱` (`1.5`), `貨櫃` (`2.0`), `火車車廂` (`2.0`), `石砌實牆` (`10`), `江戶杉木板塀` (`10`), `聖殿雕紋石柱` (`10`), `斜頂磚石房屋` (`10`), `竹林實牆` (`10`), `野生灌木草叢` (`0.0`), `林間樹木` (`10`).
  - **Numeric Height Rule**: Help height badges MUST always carry numeric values (`0.0`, `每層 +1.0`, `0.5 / 1.5`, `10`, etc.)—never non-numeric labels like `"通行無阻"` or `"水阻"`.
  - Objects with transparent gaps (e.g., `bamboo` on `hill`/`grass_ground`) never cast opaque rectangular tile shadows, revealing underlying floor textures cleanly.
- **Zero Terrain Combat Buffs & Zero Bush Vision Shrinkage**:
  - Terrain grants **zero combat stat buffs** (no `+15%` high-ground damage, no extra defense, no speed modifier) and **zero sight radius reduction** (bushes do NOT shrink enemy or player LoS).
- **Clean Combat UI Visuals**:
  - AI character nameplates render **only `e.name`** (never `[警覺]`, `[裝彈]`, `[致盲]`, etc.). When an AI freshly gains LoS to a hostile, it pops a floating yellow **`"!"`** (`#FACC15`).
  - Player death drops weapons and disappears without drawing any dark oval / "black hole" corpse marker.
- **Movement & Collision (`moveCharacterWithElevation`)**:
  - Characters can step across `|Δh| <= 0.5`.
  - `ELEV_PADDING = 0.1 * TILE` prevents snagging; 1-tile tunnels use automatic center-alignment nudging.
  - `countElevationViolations` checks 8 perimeter samples + walls + `1×1` solid trees.
- **Map Design Constraints**:
  1. All walls, water, terrain cells, crates, bamboo, and trees sit cleanly on the grid (large houses are the only multi-tile buildings).
  2. **Stair Rule**: Never place `0.5` and `1.5` hill/terrain stairs adjacent to each other; prefer `1×1` single-tile stairs matching the terrain style.
  3. **Map Catalog (7 Maps)**: `tokyo_shrine` (`grass_ground` perimeter + central dirt courtyard & shrine dais, `1×1` wood walls, no crates, 2 hills), `european_castle` (marble dais & pillars), `desert_ruins` (3-tier pyramid, tile river + 2 bridges, northeast `stone_wall_tan` wall + `(25,4)` `1×1 small_crate`, `(16,14)` big crate), `industrial_warehouse` (`2.0` shipping containers & crate stairs), `western_railway` (rail tracks, stationary train, L/U walls with `small_crate` firing slits, 2-room outpost), `bamboo_fortress` (outer & central continuous `gy=6..23` connected hills, no water/crates, 4 distinct 3-stalk bamboo tile styles spanning valleys & hills), `stanley_island` (`34×44` vertical organic outer-ring island + inner lake + islet + south channel + 2 bridges, no crates).
  4. **Same-Faction Spawns**: Non-mercenary faction spawns (`royal`, `shadow`) must be grouped near each other (`<= 3.5` tiles in test assertions) and all key map pickups/spawns must be mutually reachable via `findPathAStar`.
- **Line of Sight vs Bullet Tracing**:
  - `hasLineOfSight`: `8` tiles base (`9.5` tiles for sniper / Eagle Eye); blocked by walls, `1×1` trees, or points `> max(aElev, bElev) + 1.0`.
  - `traceBulletSegment`: Shots cannot hit targets `>= 2.0` elevation above shooter (`canRangedHitTarget`). `1.5`-tile big crates penetrate `0.49 * TILE` inward before stopping; `>= 2.0` walls/containers/trees stop immediately at the edge. All 4 guns span the full map (`Math.hypot(width, height) + TILE * 2`) and stop on first character hit.

---

## 4. Continuous Architecture & Gameplay Audit Directive

Agents working on this repository **must continuously audit both architectural consistency and gameplay rationality** across every change:
1. **Enforce Player / AI Symmetry First**: Never introduce parallel state machines, duplicate lookup tables, or legacy single-purpose fields for AI vs. Player unless intentionally specified (currently only Player reserve ammo cap vs. AI infinite reserve ammo, and AI fixed `100` reputation). Prefer shared data structures (`EquippedWeapon`), shared helpers, and shared combat/duration constants.
2. **Eliminate Dead Code & Enforce Clean Domain Taxonomy**: Remove unused type fields, stale UI props, or dead config properties immediately when mechanics change. Audit category boundaries carefully (e.g., Terrain vs. Object classification—stackable terrain `+1.0/tier` + matching stairs in Terrain; `bridge`/`rail_track`/`crate`/`wall`/`tree` in Objects; equippable gear like `shield` strictly in Weapons; numeric-only height badges), and proactively confirm edge boundaries with the user.
3. **Scrutinize Gameplay & Fairness Edge Cases**: Actively check timed-buff expiration, friendly-fire rules, zero-damage shove preservation, line-of-sight/elevation occlusion, zero hidden terrain buffs or sight penalties, shield durability conservation, spawn/respawn side-effects on queue counts, and weapon balance/feel (e.g., crosshair baseline, continuous shrink, semi-auto pistol cadence, swap speed, bounce variety, stair reachability). Whenever you spot architectural drift, undocumented asymmetry, or questionable gameplay behavior, surface it clearly for the user to decide.

---

## 5. Verification Checklist (Always Run After Code Changes)

1. `npm test -- --run` — Must pass all `64+` tests in `src/game/engine.test.ts` (add/update assertions whenever modifying map geometry, weapons, AI parity, skills, or respawn/HP rules).
2. `npm run lint` — Must exit `0` (`tsc --noEmit`).
3. `npm run build` — Must build cleanly with zero errors.
4. Confirm dev server on port `3000` serves HTTP 200 without console/runtime errors.

