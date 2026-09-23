# UI/UX Modernization — Foundation-First Pass

Date: 2026-09-22
Status: Approved by user, ready for implementation planning

## Goal

General visual/consistency modernization across the whole Server Operator
renderer (`src/components/`). Not driven by a specific bug or complaint —
the app should feel more polished and cohesive. The existing four-theme
CSS-variable system (`default`/`glassy`/`light`/`tokyo-night`, defined in
`src/index.css`) is solid and is **not** being redesigned; the problem is
how individual components consume those variables.

## Current-state findings (why this is needed)

Surveyed `src/components/*.tsx` (~20 view components, no test suite to
worry about breaking):

- **No shared UI primitives exist.** Every button, input, textarea, card,
  and section label is a hand-rolled Tailwind class string, repeated and
  drifted across files.
- **Border radius is inconsistent with no rule**: `rounded-lg` (207
  occurrences), `rounded-xl` (193), `rounded-md` (44), `rounded-full` (34),
  `rounded-2xl` (14) all appear, with no discernible logic for which is
  used where.
- **Section-header labels** (the small uppercase muted headings that title
  every card, e.g. "Serop Commands", "Projects") exist in at least 15
  near-duplicate variants — `font-bold`/`font-extrabold`,
  `tracking-wider`/`tracking-widest`, with/without `select-none` — clearly
  copy-pasted and drifted rather than intentionally different.
- **Buttons** have no shared component: solid accent, `bg-accent/10`,
  `bg-accent/15`, `bg-accent/30` "subtle" variants, outline/ghost buttons,
  and disabled-state handling are all reimplemented ad hoc per call site.
- **Inputs/textareas** mostly converge on two patterns already
  (`rounded-xl border-border/30 bg-bg-primary/50` at two padding sizes),
  so this one is close to consistent already — codifying it removes the
  remaining drift.
- **Empty states** ("select a server", "no active terminal session", etc.)
  are duplicated ad hoc in at least 5 places with slightly different
  layouts.
- `src/components/Select.tsx` is already a solid shared component
  (portal-rendered custom dropdown, opt-in reorder/remove support added
  recently) — it is reused as-is, not touched by this work.

## Design

### New shared primitives — `src/components/ui/`

A new folder, `src/components/ui/`, holds the primitives. Each is a thin
wrapper around existing Tailwind patterns already dominant in the
codebase — this is consolidation, not invention of a new visual language.

- **`Button.tsx`** — variants `solid` (accent background, white text —
  today's primary CTA pattern), `subtle` (accent-tinted background,
  accent text — today's `bg-accent/10`–`/15` pattern), `outline` (bordered,
  transparent background), `danger` (error-color equivalent of `subtle`).
  Sizes `sm`/`md` matching existing padding scales. Handles
  `disabled`/`loading` state once instead of per call site.
- **`Input.tsx` / `Textarea.tsx`** — codifies the existing dominant pattern
  (`rounded-xl bg-bg-primary/50 border border-border/30`, two padding
  sizes). No new visual style, just one source of truth.
- **`SectionLabel.tsx`** — the canonical small-caps card/section heading:
  `text-[10px] font-bold uppercase tracking-wider text-text-muted`. All
  drifted variants converge on this unless a screen has a concrete reason
  to differ (none identified so far).
- **`Card.tsx`** — the `rounded-xl border border-border bg-bg-primary`
  (or `bg-bg-secondary`, contextually) container pattern already used
  almost everywhere as a section wrapper.
- **`EmptyState.tsx`** — icon + message (+ optional action) for the
  "nothing selected / nothing to show" screens.

`Select.tsx` is left alone.

### Radius scale (rule going forward)

- `rounded-lg` (8px) — small controls: buttons, small chips/badges.
- `rounded-xl` (12px) — containers (cards, panels, dropdown surfaces) **and**
  text inputs/textareas. Inputs are the one exception to "controls get
  `rounded-lg`": a survey of existing `<input>` elements found 23 uses of
  `rounded-xl` versus 2 of `rounded-lg` — `rounded-xl` is already the
  overwhelmingly consistent convention for text fields, so inputs keep it
  rather than being forced into the buttons/chips bucket.
- `rounded-full` — pills/avatars only.
- `rounded-md` and `rounded-2xl` are retired. Existing uses get folded
  into `lg` or `xl` as the primitive components are adopted — call sites
  stop choosing a radius by hand.

### Spacing

No new spacing scale. Tailwind's existing `px-3`/`px-3.5`, `py-2`/`py-2.5`,
`gap-2`/`gap-3` values already in use are sufficient; the fix is that the
primitives bake in the right values so individual views stop re-deciding
them per instance.

### Rollout order

1. **Foundation**: build `src/components/ui/*`, no visual change to the
   app yet (primitives aren't wired in). Reviewed as its own change.
2. **Shell** (highest leverage, visible on every screen): `TitleBar.tsx`,
   `Sidebar.tsx`, `ActivityBar.tsx`, `Panel.tsx` (terminal/log frame).
3. **High-traffic views**: `ServerOverview.tsx`, `NoServerView.tsx`,
   `MultiServerBar.tsx`, `AddServerModal.tsx`, `DeploySidebar.tsx`,
   `DeployView.tsx`, `DockerView.tsx`, `DatabaseView.tsx`.
4. **Remaining views**: `NotesSidebar.tsx`, `FirewallView.tsx`,
   `SettingsView.tsx`, `ConfigCreators.tsx`, `RepoSidebar.tsx`,
   `ServerToolsView.tsx`, `EditorArea.tsx`, `ProjectTerminal.tsx`.

Each step is a mechanical swap of hand-rolled markup for the new
primitives within one or a few related files — independently reviewable
and revertable. `App.tsx` itself is touched only incidentally (e.g. if it
inlines a button/card directly), not restructured.

### Verification

No test suite exists in this repo (confirmed in `CLAUDE.md`). Verification
is: `tsc --noEmit` after each step, plus running `npm run electron:dev`
and visually checking the touched view(s) in at least two themes
(default + one other, e.g. `light`, since it's the most visually distinct)
to confirm no regressions and no broken contrast/spacing.

## Non-goals (explicitly out of scope)

- No new features or behavior changes.
- No navigation/IA restructuring.
- No changes to the theme token values in `index.css`.
- No layout changes beyond what naturally falls out of adopting consistent
  primitives.
- Fixing an obvious usability paper-cut a primitive swap happens to reveal
  (e.g. a missing disabled/focus state) is in scope; hunting for new ones
  beyond that is not.
