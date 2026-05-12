# TFT Planner Code Format

## Overview

A **planner code** is a compact, URL-safe string that encodes a complete TFT board
state (champions, positions, star levels, and items). It is designed to be copied
into a URL fragment or shared as plain text.

The code is the **base64url** encoding of a UTF-8 JSON payload. It is human-debuggable:
decoding the base64url string always yields readable JSON.

---

## Payload schema (version 1)

```typescript
type PlannerPayload = {
  v: 1;           // schema version — bump when the structure changes
  set: number;    // TFT set number, e.g. 14
  units: Array<{
    id: string;   // champion apiName from CommunityDragon, e.g. "TFT14_Jinx"
    pos: number;  // board position: row * 7 + col  (0 = top-left, 27 = bottom-right)
    star: 1 | 2 | 3;
    items: string[];  // item apiNames, max 3, empty array if none
  }>;
};
```

### Board position layout

```
col:  0   1   2   3   4   5   6
row 0:  0   1   2   3   4   5   6   (back row — hexes furthest from enemy)
row 1:  7   8   9  10  11  12  13
row 2: 14  15  16  17  18  19  20
row 3: 21  22  23  24  25  26  27   (front row)
```

Position = `row * 7 + col`. Valid range: 0–27.

---

## Encoding procedure

1. Build the payload object (schema version 1).
2. `JSON.stringify(payload)` — minified, no trailing whitespace.
3. UTF-8 encode (browsers: `TextEncoder`).
4. base64url-encode: standard base64, then replace `+` → `-`, `/` → `_`, strip `=` padding.

### Decoding (for future import feature)

1. base64url-decode → UTF-8 bytes.
2. `JSON.parse` → payload object.
3. Validate `v === 1` before reading other fields.

---

## Example

Board: Jinx (cost 2★, pos 3) + Ahri (cost 3★, pos 10), Set 14, no items.

```json
{"v":1,"set":14,"units":[{"id":"TFT14_Jinx","pos":3,"star":2,"items":[]},{"id":"TFT14_Ahri","pos":10,"star":1,"items":[]}]}
```

base64url: `eyJ2IjoxLCJzZXQiOjE0LCJ1bml0cyI6W3siaWQiOiJURlQxNF9KaW54IiwicG9zIjozLCJzdGFyIjoyLCJpdGVtcyI6W119LHsiaWQiOiJURlQxNF9BaHJpIiwicG9zIjoxMCwic3RhciI6MSwiaXRlbXMiOltdfV19`

---

## Relationship to third-party planners

This format is **our own** internal codec, not the native format of tactics.tools,
MetaTFT, or any other external planner. Goals:

- **Stable**: we control the schema and can version it.
- **Debuggable**: base64url → JSON is a one-liner in any browser console.
- **Extensible**: future fields (augments, traits, bench) can be added in v2 without
  breaking existing codes.

### If you want tactics.tools compatibility

The tactics.tools team-builder URL uses `https://tactics.tools/team-builder#<code>`.
Their code format appears to be JSON base64url as well, but the exact field names
and schema have not been reverse-engineered from a live URL + decoded payload pair.

**To validate**: open tactics.tools, build a known board, copy the URL fragment,
decode it with `atob(fragment.replace(/-/g,'+').replace(/_/g,'/'))`, then compare
the JSON schema to our `PlannerPayload`. Adjust field names in `planner-code.ts` if
they match and update this doc.

---

## Files

| File | Role |
|---|---|
| `src/features/tft-data/planner-code.ts` | Encode / decode logic — **isolated, no UI imports** |
| `src/features/board-builder/BoardStepCard.tsx` | "Copy planner code" button — calls codec, writes to clipboard |
