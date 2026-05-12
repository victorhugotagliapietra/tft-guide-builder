## TFT Guide Builder — Phase 1: Auth + Guide CRUD

Stack: TanStack Start + Lovable Cloud (Supabase) + Tailwind/shadcn. Dark, minimal gaming-SaaS feel. Board builder comes in Phase 2.

### Scope (this pass)

1. Enable Lovable Cloud
2. Email/password + Google auth, with `profiles` table
3. Database schema for guides (board steps stored as JSON for now — schema firms up in Phase 2)
4. Authenticated dashboard listing user's guides
5. Create / edit / delete guide (metadata only — title, description, set, patch, playstyle, difficulty, notes)
6. Public read-only guide page at `/g/$slug`
7. Landing page with featured/public guides
8. Dark theme + design tokens

Board step editor, unit/item placement, planner code, and CDragon data come in Phase 2.

### Routes

```
/                       landing — hero + recent public guides
/login                  email/password + Google
/signup
/g/$slug                public read-only guide
/_authenticated/
  dashboard             my guides list + "New guide" CTA
  guides/new            create form → redirect to edit
  guides/$id/edit       edit metadata, toggle public, delete
```

### Data model (Phase 1)

- `profiles` (id → auth.users, username, display_name, avatar_url, created_at)
  - auto-created via trigger on signup
  - RLS: anyone can read, only owner can update
- `guides`
  - id (uuid), author_id (→ auth.users), slug (unique), title, description
  - tft_set (text), patch (text), playstyle (text), difficulty (enum: easy/medium/hard)
  - final_comp_notes (text), is_public (bool, default false)
  - board_steps (jsonb, default `[]`) — placeholder until Phase 2 board builder
  - created_at, updated_at
  - RLS: select if `is_public OR auth.uid() = author_id`; insert/update/delete only by owner

No separate `board_steps` / `board_units` tables yet — keeping as JSON keeps Phase 1 small and lets Phase 2 reshape freely.

### Auth flow

- Supabase email/password + Google provider (Lovable Cloud managed)
- `onAuthStateChange` listener set up in a `useAuth` hook before `getSession()`
- `_authenticated` pathless layout with `beforeLoad` → redirect to `/login` if no session
- Signup uses `emailRedirectTo: window.location.origin`

### UI

- shadcn components: Button, Input, Textarea, Select, Card, Dialog, DropdownMenu, Badge, Sonner toasts
- Dark mode default in `styles.css`; tokens for surface/border/accent tuned to gaming-SaaS (deep neutral background, subtle accent, sharp 8px radius)
- Dashboard: card grid of guides with set/patch/difficulty badges, public/private indicator
- Guide edit form: single page, autosave on blur or explicit Save button (Phase 1 = explicit Save)
- Public guide page: read-only metadata + notes; placeholder "Boards coming soon" section so the share link works end-to-end

### Technical notes

- Server functions in `src/lib/guides.functions.ts` using `requireSupabaseAuth` middleware for owner-scoped reads/writes
- Public guide fetch via browser supabase client (RLS allows public reads)
- Slug generation: slugify(title) + short nanoid suffix on create
- Zod validation on all mutations
- `_authenticated` loader gated with `supabase.auth.getUser()` in `beforeLoad` to avoid SSR 401 race

### Out of scope (Phase 2+)

- Board renderer + drag/drop placement (dnd-kit)
- Champion/trait/item data from Community Dragon (fetched + cached)
- Item assignment, positioning, transitions, item holders, substitutions
- Planner code generation
- Per-board notes UI
