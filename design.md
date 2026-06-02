# Server Operator — Design System Specification

This document details the complete design system, CSS-first Tailwind configuration, layout paradigms, typography, dynamic animations, scrollbars, z-index hierarchies, and component styling patterns for Server Operator.

---

## 1. Color Palette & Semantic Tokens

To ensure absolute style consistency and eliminate token naming collisions, colors are mapped to semantic custom Tailwind CSS v4 variables inside the `@theme` block in `src/index.css`.

### Background Mappings
*   **`bg-bg-primary`** (`#1e1e1e`): The default workspace backdrop. Used in code workspace panels, terminal view containers, log view tracks, and database query fields.
*   **`bg-bg-secondary`** (`#252526`): Standard secondary surface layout. Used in toolbars, sidebars, activity grids, select dropdowns, and modal frames.
*   **`bg-bg-tertiary`** (`#2a2d2e`): Selected card element backgrounds, search fields, active tabs, list item hover states, and input textareas.
*   **`bg-bg-activity`** (`#333333`): Background for the vertical navigation Activity Bar pinned on the left side of the screen.

### Separation Borders
*   **`border-border`** (`#3c3c3c`): Element divider line color. Used strictly for border boundaries between sidebars, terminal panes, database grids, and card rows.

### Text & Typography Colors
*   **`text-text-primary`** (`#cccccc`): General application text, input fields, labels, buttons, and headers.
*   **`text-text-secondary`** (`#858585`): Subtitle text, folder routes, file descriptions, settings instructions, and log timestamps.
*   **`text-text-muted`** (`#6e7681`): Empty state prompts, list placeholders, path indices, and inactive/disabled options.

### Accent & Branding Mappings
*   **`bg-accent`** / **`text-accent`** (`#0078d4`): Brand primary color. Represents connected status states, active selected items, loading loops, and primary submission buttons.
*   **`bg-accent-hover`** (`#3794ff`): Brand primary hover color. Applied dynamically to accent buttons and clickable highlight icons to signal responsiveness.

### Semantic Status Mappings
*   **`success`** (`#4ec9b0`): Green status color. Represents active SSH tunnels, online database nodes, successful deployments, and completed operations.
*   **`warning`** (`#dcdcaa`): Yellow warning color. Represents dirty unsaved text tabs, pending connection queues, and system warnings.
*   **`error`** (`#f14c4c`): Red error color. Represents failed connection attempts, process crashes, deployment errors, and termination cues.

---

## 2. Typography & Fonts

Server Operator enforces a cohesive developer-centric typography system across the entire application interface.

*   **`font-sans`** & **`font-mono`**: Mapped uniformly to standard system developer monospace fonts inside `@theme` to guarantee clean text column alignments across sidebars, logs, database grids, and editing rows:
    `"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace`
*   **Text Sizing Standards**:
    *   `text-xs` (12px): Explanatory paths, sidebar text fields, tooltips, list counts, buttons.
    *   `text-sm` (13px / 14px): Input fields, general card layouts, sidebar names, tables, and settings fields.
    *   `text-base` / `text-lg` / `text-xl` (15px to 20px): Main modal headers, settings titles, and view categories.

---

## 3. Layout, Alignment & Grids

The application adheres to a structured, border-oriented layout format resembling modern IDE interfaces.

*   **Global Window Grid**: Structured utilizing high-flex grids and flexible Flexbox properties. Height and width calculations utilize exact viewport constraints (`h-screen`, `w-screen`) to prevent browser container scrolling.
*   **Split Panels**: Main view sections (File Explorer, Editor Area, Terminal Panel) are dynamically partitioned utilizing borders (`border-border`), supporting fluid resize dynamics via resizer panels.
*   **List Alignment**: Tables, database columns, and explorer folders match layout guidelines with strict vertical padding (`py-1.5`, `py-2`) and horizontal indent spacing (e.g., recursive depths in directory hierarchies).

---

## 4. Scrollbar Overrides

Customized WebKit scrollbars are injected into the Tailwind `@layer base` block inside `src/index.css` to match dark-theme IDE aesthetics and keep layouts clean:

*   **Scrollbar Dimensions**: Pinned to a subtle width/height of `10px` globally, and custom lists utilize local `6px` scrollbars.
*   **Scrollbar Track**: Configured utilizing `var(--color-bg-secondary)` to match background frames.
*   **Scrollbar Thumb**: Styled with `var(--color-bg-tertiary)` with a radius of `5px` to remain unobtrusive.
*   **Scrollbar Thumb Hover**: Highlighted using `#505050` or `var(--color-border)` to provide a feedback response.

---

## 5. Animations & Micro-Transitions

Micro-interactions make the user interface responsive and alive. All visual updates use CSS-based transitions and Framer Motion spring curves:

*   **Accordion Wrapper Grid Transition**: Used for expanding directory subfolders or collapsible settings modules without shifts. Uses grid row height transforms (`grid-template-rows: 0fr` to `1fr` transitions) for smooth easing:
    ```css
    .accordion-wrapper {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      visibility: hidden;
      transition: grid-template-rows 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease-out, visibility 0.2s;
    }
    .accordion-wrapper.open {
      grid-template-rows: 1fr;
      opacity: 1;
      visibility: visible;
    }
    ```
*   **Transition Easing**: Normal hover indicators on icons, selectors, list entries, and tabs use standard property updates (`transition-colors duration-150 ease-out`).
*   **Toast Transitions**: Toast messages (like the up-to-date alert) utilize smooth spring entrance frames:
    ```css
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }
    ```

---

## 6. Z-Index Hierarchies

Z-index constraints are strictly mapped to ensure overlays sit exactly on the right plane without hiding dropdown targets:

*   **Base Panels (`z-0`)**: Workspace columns, terminal containers, and logs.
*   **Tooltips (`z-[99]`)**: Floating indicator boxes hover exactly above adjacent items.
*   **Floating Toasts (`z-[9999]`)**: Floating auto-update alerts and connection notifications.
*   **Custom Select Dropdowns (`z-[99999]`)**: React portals attached directly to `document.body` require absolute visibility over all overlays to prevent overlap.

---

## 7. Component Styling Patterns & Icons

*   **Interactive State Patterns**:
    *   **Inactive**: Inactive sidebars or tabs use muted text styling (`text-text-secondary`) and hover backgrounds (`hover:bg-bg-secondary/50`).
    *   **Active**: Selected files or views transition to active colors (`bg-bg-tertiary text-accent`).
*   **Forms & Inputs**:
    *   Styled with `bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 rounded-xl text-xs`.
    *   **Custom Form Validation**: Native browser validation popups (e.g. standard HTML5 tooltip bubbles) are disabled globally on forms using `noValidate`. Invalid empty states dynamically receive high-fidelity, desaturated red borders (`border-error/45 bg-error/5 text-error`) and show responsive, compact warning banners accompanied by helper icons. Visual error styling is cleared dynamically as soon as a user starts typing.
    *   **Custom Checkboxes**: Standard HTML `<input type="checkbox">` elements are replaced with custom React-controlled buttons (`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-150`). When checked, they fill with the accent theme color (`bg-accent border-accent`) and reveal a sharp checkmark vector (`Check` from Lucide), completely eliminating native browser box overrides.
*   **SVG Vector Icons**:
    *   Server Operator relies on standard Lucide React icons. Icon colors match the respective element states (`text-accent` for selected items, `text-success` for connected systems).

---
