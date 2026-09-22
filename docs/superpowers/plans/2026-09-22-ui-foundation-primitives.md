# UI Foundation Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the five shared UI primitives (`Button`, `Input`, `Textarea`, `SectionLabel`, `Card`, `EmptyState`) called for in the UI/UX modernization spec, each proven with one real pilot integration in the existing app — no dead/unused components.

**Architecture:** New folder `src/components/ui/` holds one presentational component per file (thin wrappers around the Tailwind class strings already dominant in the codebase — consolidation, not a new visual language). Each task creates one primitive and immediately swaps it into one existing, low-risk call site so the change is visually verifiable in the running app, not just compiled.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS v4 (`@theme` tokens in `src/index.css`), no component test framework.

**Spec:** `docs/superpowers/specs/2026-09-22-ui-ux-modernization-design.md`

## Global Constraints

- This repo has **no test framework and no lint config** (confirmed in `CLAUDE.md`). There is no red/green test cycle available. Every task's verification is: (a) `tsc --noEmit -p tsconfig.json` reports zero errors, and (b) a manual visual check by running `npm run electron:dev` and looking at the specific touched screen in **two themes**: default (no `data-app-theme` attribute) and `light` (Settings → Appearance, or `document.documentElement.setAttribute('data-app-theme', 'light')` in devtools console for a quick check).
- Radius scale (from the spec): `rounded-lg` for controls (buttons, inputs, chips). `rounded-xl` for containers (cards, panels, dropdown surfaces). `rounded-full` for pills only. Do not introduce `rounded-md` or `rounded-2xl` in new code.
- New primitives live under `src/components/ui/`, one component per file, named exports (matches the existing convention in `src/components/Select.tsx`, `src/components/Tooltip.tsx`).
- Do not touch `src/index.css` or any `--color-*`/`--font-*` token values — the theme system is out of scope.
- Do not change any behavior (state, handlers, props passed through) at a pilot integration site — only the markup/className should change. If a pilot swap would visibly change more than radius/spacing (e.g. would change copy or remove a feature), stop and flag it instead of proceeding.
- Every task ends with its own commit. Commit messages: `feat(ui): add <Component> primitive`.

---

### Task 1: `Button` primitive

**Files:**
- Create: `src/components/ui/Button.tsx`
- Modify: `src/components/DeploySidebar.tsx:510-516` and `:527-534` (the "Run" and "Run edited" buttons inside the shortcut list item)

**Interfaces:**
- Produces: `Button` component, default export none, named export `Button`. Props: `variant?: 'solid' | 'subtle' | 'outline' | 'danger'` (default `'solid'`), `size?: 'sm' | 'md'` (default `'md'`), plus all standard `React.ButtonHTMLAttributes<HTMLButtonElement>` (so `onClick`, `disabled`, `className`, `type`, children, etc. all pass through). `type` defaults to `'button'` if not specified (so it never accidentally submits a form).

- [ ] **Step 1: Create `src/components/ui/Button.tsx`**

```tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'solid' | 'subtle' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  solid: 'bg-accent text-white hover:bg-accent-hover',
  subtle: 'bg-accent/15 text-accent hover:bg-accent/25',
  outline: 'border border-border/30 bg-bg-secondary text-text-primary hover:border-border/60 hover:bg-bg-tertiary',
  danger: 'bg-error/15 text-error hover:bg-error/25',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 rounded-lg text-[10px] gap-1',
  md: 'px-3.5 py-2 rounded-xl text-xs gap-1.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'solid', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Swap the two pilot buttons in `src/components/DeploySidebar.tsx`**

Add `import { Button } from './ui/Button';` near the top with the other local imports (after the `Select` import).

Replace (around line 510-516):
```tsx
                      <button
                        type="button"
                        onClick={() => runShortcut(shortcut.command)}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
                      >
                        <Play size={10} />Run
                      </button>
```
with:
```tsx
                      <Button variant="subtle" size="sm" onClick={() => runShortcut(shortcut.command)} className="shrink-0">
                        <Play size={10} />Run
                      </Button>
```

Replace (around line 527-534):
```tsx
                          <button
                            type="button"
                            onClick={() => runShortcut(editedCommand)}
                            disabled={!editedCommand.trim()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Play size={10} />Run edited
                          </button>
```
with:
```tsx
                          <Button variant="solid" size="sm" onClick={() => runShortcut(editedCommand)} disabled={!editedCommand.trim()}>
                            <Play size={10} />Run edited
                          </Button>
```

- [ ] **Step 4: Typecheck again**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run `npm run electron:dev`, open a server with a `.serop` file (or use the local/dummy workspace), go to Deploy tab → Serop Commands, expand a shortcut. Confirm the "Run" pill and "Run edited" button are pixel-equivalent to before (same padding/radius/colors), respond to click the same way, and the disabled state on "Run edited" (empty text) still shows at 50% opacity with no pointer cursor. Repeat with the `light` theme.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Button.tsx src/components/DeploySidebar.tsx
git commit -m "feat(ui): add Button primitive"
```

---

### Task 2: `Input` primitive

**Files:**
- Create: `src/components/ui/Input.tsx`
- Modify: `src/components/AddServerModal.tsx:45-94` (all five text fields; line numbers unaffected by other tasks since this file isn't touched elsewhere in this plan)

**Interfaces:**
- Produces: `Input` component, named export `Input`. Props: `size?: 'sm' | 'md'` (default `'md'`), plus all standard `React.InputHTMLAttributes<HTMLInputElement>` **except** the native `size` attribute, which is shadowed by our own `size` prop (must `Omit<'size'>` from the extended interface or TypeScript will reject the redeclaration — the native attribute is rarely used and isn't used anywhere in this codebase today, confirmed by `grep -n 'size='` producing no `<input>` hits).

- [ ] **Step 1: Create `src/components/ui/Input.tsx`**

```tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

type InputSize = 'sm' | 'md';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
}

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2.5 text-xs',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', className = '', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Swap all five inputs in `src/components/AddServerModal.tsx`**

Add `import { Input } from './ui/Input';` near the top (after the `types` import).

Each of the five fields (Display Name, Host address, Username, SSH Private Key Path, Remote CWD/Project Path) currently looks like this (example — Display Name, lines 46-53):

```tsx
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production API Server"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs"
            />
          </div>
```

Replace the `<input ... className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs" />` element with `<Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Production API Server" />` (i.e. drop the now-redundant `className`, keep everything else identical). Do the same for the other four fields — only the `className` prop is removed in each case; `value`/`onChange`/`placeholder`/`type` stay exactly as they are for `host`, `username`, `privateKeyPath`, and `projectPath`.

- [ ] **Step 4: Typecheck again**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run `npm run electron:dev`, click "Add Server" to open the modal. Confirm all five fields look and behave identically to before (typing, placeholder text, focus ring). Repeat in the `light` theme. Confirm the Cancel/Add Server Profile buttons at the bottom are untouched (they're out of scope for this task).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Input.tsx src/components/AddServerModal.tsx
git commit -m "feat(ui): add Input primitive"
```

---

### Task 3: `Textarea` primitive

**Files:**
- Create: `src/components/ui/Textarea.tsx`
- Modify: `src/components/DeploySidebar.tsx:520-525` (the shortcut command edit box; run this task after Task 1, which also touches this file)

**Interfaces:**
- Produces: `Textarea` component, named export `Textarea`. Props: `size?: 'sm' | 'md'` (default `'md'`), plus all standard `React.TextareaHTMLAttributes<HTMLTextAreaElement>`.

- [ ] **Step 1: Create `src/components/ui/Textarea.tsx`**

```tsx
import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type TextareaSize = 'sm' | 'md';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: TextareaSize;
}

const SIZE_CLASSES: Record<TextareaSize, string> = {
  sm: 'px-2.5 py-1.5 text-[10px]',
  md: 'px-3 py-2 text-xs',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', className = '', ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-xl bg-bg-primary/40 border border-border/20 font-mono text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-accent ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Swap the shortcut-edit textarea in `src/components/DeploySidebar.tsx`**

Add `import { Textarea } from './ui/Textarea';` near the top.

Replace (around line 520-525):
```tsx
                        <textarea
                          value={editedCommand}
                          onChange={(e) => setEditedShortcutCommands((prev) => ({ ...prev, [shortcut.id]: e.target.value }))}
                          rows={4}
                          className="w-full px-3 py-2 rounded-xl bg-bg-primary/40 border border-border/20 text-[10px] font-mono text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-accent"
                        />
```
with:
```tsx
                        <Textarea
                          size="sm"
                          value={editedCommand}
                          onChange={(e) => setEditedShortcutCommands((prev) => ({ ...prev, [shortcut.id]: e.target.value }))}
                          rows={4}
                        />
```

- [ ] **Step 4: Typecheck again**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run `npm run electron:dev`, Deploy tab → Serop Commands, expand a shortcut to reveal the edit box. Confirm font size, padding, and border look identical to before, and editing/resizing still works. Repeat in `light` theme.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Textarea.tsx src/components/DeploySidebar.tsx
git commit -m "feat(ui): add Textarea primitive"
```

---

### Task 4: `SectionLabel` primitive

**Files:**
- Create: `src/components/ui/SectionLabel.tsx`
- Modify: `src/components/DeploySidebar.tsx:425` and `:458` (the "Projects" and "Serop Commands" headings; run this task after Tasks 1 and 3, which also touch this file)

**Interfaces:**
- Produces: `SectionLabel` component, named export `SectionLabel`. Props: `children: React.ReactNode`, `className?: string`.

- [ ] **Step 1: Create `src/components/ui/SectionLabel.tsx`**

```tsx
import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider text-text-muted ${className}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Swap the two labels in `src/components/DeploySidebar.tsx`**

Add `import { SectionLabel } from './ui/SectionLabel';` near the top.

Replace (line 425):
```tsx
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Projects</span>
```
with:
```tsx
          <SectionLabel>Projects</SectionLabel>
```

Replace (line 458):
```tsx
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Serop Commands</span>
```
with:
```tsx
          <SectionLabel>Serop Commands</SectionLabel>
```

Note: this changes `tracking-widest` to `tracking-wider` per the spec's canonical style — a deliberate, intentional pixel-level difference (very subtle, letter-spacing only), not a bug.

- [ ] **Step 4: Typecheck again**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run `npm run electron:dev`, Deploy tab. Confirm "Projects" and "Serop Commands" headings still read as small uppercase muted labels — letter-spacing will be very slightly tighter than before, everything else identical. Repeat in `light` theme.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SectionLabel.tsx src/components/DeploySidebar.tsx
git commit -m "feat(ui): add SectionLabel primitive"
```

---

### Task 5: `Card` primitive

**Files:**
- Create: `src/components/ui/Card.tsx`
- Modify: `src/components/DeploySidebar.tsx:423` (the "Projects" card wrapper; run this task after Tasks 1, 3, and 4, which also touch this file)

**Interfaces:**
- Produces: `Card` component, named export `Card`. Props: `tone?: 'primary' | 'secondary'` (default `'primary'`), plus all standard `React.HTMLAttributes<HTMLDivElement>` (so `className`, `children`, etc. pass through).

- [ ] **Step 1: Create `src/components/ui/Card.tsx`**

```tsx
import type { HTMLAttributes } from 'react';

type CardTone = 'primary' | 'secondary';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const TONE_CLASSES: Record<CardTone, string> = {
  primary: 'bg-bg-primary',
  secondary: 'bg-bg-secondary/35',
};

export function Card({ tone = 'primary', className = '', ...props }: CardProps) {
  return <div className={`rounded-xl border border-border ${TONE_CLASSES[tone]} ${className}`} {...props} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Swap the Projects card wrapper in `src/components/DeploySidebar.tsx`**

Add `import { Card } from './ui/Card';` near the top.

Replace (line 423):
```tsx
      <div className="rounded-lg border border-border bg-bg-primary p-3 text-sm space-y-3">
```
with:
```tsx
      <Card className="p-3 text-sm space-y-3">
```
and its matching closing `</div>` (line 454, the one that closes this card, immediately before the "Serop Commands" `<div className="rounded-lg border border-border bg-bg-primary overflow-hidden">` block) becomes `</Card>`.

Note: this changes the card's radius from `rounded-lg` (8px) to `rounded-xl` (12px) per the spec's radius-scale rule (containers use `xl`, not `lg`) — a deliberate, intentional visual change, not a bug. Only this one card is touched in this task; the "Serop Commands" and "Context" cards below it are intentionally left as-is for a later phase (they have a collapsible header structure that doesn't map cleanly onto a plain `Card` wrapper yet).

- [ ] **Step 4: Typecheck again**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run `npm run electron:dev`, Deploy tab. Confirm the "Projects" card (chips + "Viewing: ..." line) still looks like a bordered card with the same background, just very slightly more rounded corners than before. Repeat in `light` theme.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Card.tsx src/components/DeploySidebar.tsx
git commit -m "feat(ui): add Card primitive"
```

---

### Task 6: `EmptyState` primitive

**Files:**
- Create: `src/components/ui/EmptyState.tsx`
- Modify: `src/components/Panel.tsx:761-770` (the "No active terminal session" empty state)

**Interfaces:**
- Consumes: `Button` from Task 1 (`import { Button } from './ui/Button'`, `variant="outline"`).
- Produces: `EmptyState` component, named export `EmptyState`. Props: `icon?: import('lucide-react').LucideIcon`, `message: string`, `action?: React.ReactNode`, `className?: string`.

- [ ] **Step 1: Create `src/components/ui/EmptyState.tsx`**

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex-1 p-6 flex flex-col items-center justify-center gap-4 text-text-secondary text-xs select-none ${className}`}>
      {Icon && <Icon size={28} className="text-text-muted" />}
      <p className="text-text-muted text-center max-w-sm">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Swap the terminal empty state in `src/components/Panel.tsx`**

Add `import { EmptyState } from './ui/EmptyState';` and `import { Button } from './ui/Button';` near the top, alongside the existing `lucide-react` import (this file isn't touched by any earlier task in this plan, so there's no existing `ui/` import to conflict with).

Replace (line 761-771):
```tsx
                      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4 text-text-secondary text-xs select-none bg-bg-primary">
                        <p className="text-text-muted text-center max-w-sm">No active terminal session. Spawn a remote SSH command shell or container debug console.</p>
                        <button
                          type="button"
                          onClick={addTerminalTab}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/30 bg-bg-secondary text-text-primary font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all cursor-pointer shadow-sm"
                        >
                          <Plus size={14} />
                          New Shell Session
                        </button>
                      </div>
```
with:
```tsx
                      <EmptyState
                        className="bg-bg-primary"
                        message="No active terminal session. Spawn a remote SSH command shell or container debug console."
                        action={
                          <Button variant="outline" onClick={addTerminalTab} className="shadow-sm">
                            <Plus size={14} />
                            New Shell Session
                          </Button>
                        }
                      />
```

- [ ] **Step 4: Typecheck again**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run `npm run electron:dev`, connect to a server (or the local/dummy workspace), open the Terminal panel with no shell tabs open. Confirm the empty-state message and "New Shell Session" button look and behave identically to before, and clicking the button still opens a new shell tab. Repeat in `light` theme.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/EmptyState.tsx src/components/Panel.tsx
git commit -m "feat(ui): add EmptyState primitive"
```

---

### Task 7: Barrel export and final full-project typecheck

**Files:**
- Create: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `Button` (Task 1), `Input` (Task 2), `Textarea` (Task 3), `SectionLabel` (Task 4), `Card` (Task 5), `EmptyState` (Task 6).
- Produces: single import point `from '../ui'` (or `'./ui'` depending on caller depth) re-exporting all six, for the later rollout phases to use instead of six separate import lines.

- [ ] **Step 1: Create `src/components/ui/index.ts`**

```ts
export { Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';
export { Input } from './Input';
export { Textarea } from './Textarea';
export { SectionLabel } from './SectionLabel';
export { Card } from './Card';
export { EmptyState } from './EmptyState';
```

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Full manual smoke pass**

Run `npm run electron:dev`. Walk through: Add Server modal, Deploy tab (Projects card, Serop Commands section, an expanded shortcut's edit box and both Run buttons), and the Terminal panel empty state. Confirm nothing regressed relative to the individual task checks above, in both default and `light` themes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/index.ts
git commit -m "feat(ui): add barrel export for ui primitives"
```
