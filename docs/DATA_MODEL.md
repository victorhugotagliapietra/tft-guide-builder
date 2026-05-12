# Data Model — TFT Guide Builder

## Overview

Board steps are stored as a JSONB array (`board_steps`) inside the `guides` table in Supabase.
This avoids a separate join for the most common read path (rendering a guide).

---

## Database Tables

### `profiles`
Auto-created on signup via Supabase trigger.

| Column        | Type      | Notes                       |
|---------------|-----------|-----------------------------|
| id            | UUID PK   | References auth.users(id)   |
| username      | TEXT      | Unique, optional            |
| display_name  | TEXT      |                             |
| avatar_url    | TEXT      |                             |
| created_at    | TIMESTAMPTZ |                           |
| updated_at    | TIMESTAMPTZ |                           |

### `guides`
One row per guide. Board steps are embedded as JSONB.

| Column           | Type                  | Notes                                      |
|------------------|-----------------------|--------------------------------------------|
| id               | UUID PK               | gen_random_uuid()                          |
| author_id        | UUID FK               | References auth.users(id)                  |
| slug             | TEXT UNIQUE           | Public URL slug, e.g. `fast-8-lillia-abc1` |
| title            | TEXT                  |                                            |
| description      | TEXT                  |                                            |
| tft_set          | TEXT                  | e.g. "14"                                  |
| patch            | TEXT                  | e.g. "14.10"                               |
| playstyle        | TEXT                  | e.g. "Reroll", "Fast 8", "Standard"        |
| difficulty       | guide_difficulty enum | easy / medium / hard                       |
| final_comp_notes | TEXT                  | Notes on the full capped board             |
| is_public        | BOOLEAN               | Controls public visibility                 |
| board_steps      | JSONB                 | Array of BoardStep (see below)             |
| created_at       | TIMESTAMPTZ           |                                            |
| updated_at       | TIMESTAMPTZ           |                                            |

RLS policies:
- SELECT: public guides visible to all; drafts visible to author only
- INSERT/UPDATE/DELETE: author only

---

## TypeScript Types

### `BoardStep` (embedded in guides.board_steps)

```ts
type StepType =
  | "early"
  | "mid"
  | "stabilization"
  | "transition"
  | "low-cost"
  | "final"
  | "capped"
  | "alternative";

type BoardStep = {
  id: string;          // client-generated UUID
  title: string;       // e.g. "Level 6 — Stabilize"
  level: number;       // TFT player level, e.g. 6
  stepType: StepType;
  description: string; // Notes for this board step
  units: BoardUnit[];
  sortOrder: number;   // Manual ordering
};
```

### `BoardUnit` (embedded inside BoardStep.units)

```ts
type BoardUnit = {
  id: string;           // client-generated UUID
  championKey: string;  // CommunityDragon key e.g. "TFT14_Jinx"
  position: number;     // 0–27 (row * 7 + col on a 4×7 hex grid)
  items: string[];      // CommunityDragon item keys, up to 3
  starLevel: 1 | 2 | 3;
  isCarry: boolean;
  isItemHolder: boolean;
};
```

---

## TFT Data (external, CommunityDragon)

Champions, traits, and items are **not stored in the database**. They are fetched at runtime
from the CommunityDragon CDN and cached in memory/React Query.

Base URL: `https://raw.communitydragon.org/latest/cdragon/tft/en_us.json`

### `TFTChampion`
```ts
type TFTChampion = {
  apiName: string;   // e.g. "TFT14_Jinx"
  name: string;      // e.g. "Jinx"
  cost: number;      // 1–5
  traits: string[];  // trait apiNames
  squareIconPath: string;
};
```

### `TFTItem`
```ts
type TFTItem = {
  apiName: string;
  name: string;
  iconPath: string;
  isComponent: boolean;
  isEmblem: boolean;
};
```

### `TFTTrait`
```ts
type TFTTrait = {
  apiName: string;
  name: string;
  iconPath: string;
};
```

---

## Board Grid

Standard TFT board: **4 rows × 7 columns = 28 hexes**.

Position encoding:
- `position = row * 7 + col`
- Row 0 = back row (row closest to the player's bench side)
- Col 0 = leftmost hex

```
col: 0  1  2  3  4  5  6
row 0: [ 0][ 1][ 2][ 3][ 4][ 5][ 6]
row 1: [ 7][ 8][ 9][10][11][12][13]
row 2: [14][15][16][17][18][19][20]
row 3: [21][22][23][24][25][26][27]
```
