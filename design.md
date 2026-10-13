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

## 8. Marketing Website (`website/`)

The public site (`index.html`, `changelog.html`) is separate from the app and follows the **BeForth Design System V2**, not the dark IDE theme above. It is plain HTML, one stylesheet (`styles.css`) and two small scripts, with no build step. Preview it with the `website` entry in `.claude/launch.json` (`python3 -m http.server 4173 -d website`).

### Colour (seven tokens, one accent)

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F2F7F9` | Page canvas |
| `--bone` | `#D6E7F1` | Alternate section background, flat fills inside drawings |
| `--ink` | `#231F20` | Body text, dark code panels, line work |
| `--ash` | `#5F6571` | Secondary text only (AA contrast) |
| `--signal` | `#1C75BC` | The single accent: primary action, key words, "connected" parts of drawings |
| `--wave` | `#75BAE6` | Accent on dark surfaces only (code-panel prompts) |
| `--signal-deep` | `#165B93` | Hover for `signal` |

Separate with `bone` and 1px rules (`ink` at 12%). Cards are `.feature-card`/`.download-card`/`.release-card`: 1px border, white fill, square corners. Pills and avatars are the only rounded elements.

### Type
**Plus Jakarta Sans** for everything, **JetBrains Mono** for code and doodle labels. A metric-matched `Plus Jakarta Fallback` face stops layout shift while the web font loads. Headings are left aligned: hero `clamp(2rem, 5.6vw, 4.25rem)` / 800, section titles `clamp(1.7rem, 4vw, 3.2rem)` / 700. Buttons are sentence case, 15px, semibold; hover is a colour change.

### Page rules
Skip link first, exactly one `<main id="main-content">` and one `<h1>` per page, real lists, visible focus. Titles stay at 60 characters or fewer, descriptions at 160 or fewer.

### Doodles
Inline SVG, `aria-hidden="true"`, hand-drawn wobble from the shared `#sketch` / `#sketch-md` filters (defined once per page in a hidden SVG after `<body>`). Classes: `.l` ink line, `.a` signal line, `.b` bone fill, `.w` white fill, `.k` ink dot, `.s` signal dot, `.t` mono label, `.pkt` travelling packet. No gradients or shadows. Each drawing shows only what its own section says and is never reused.

| Where | Subject |
|---|---|
| Hero | Laptop connected over SSH (padlock) to three servers, a container box with a deploy arrow, a "deploy" tick |
| Feature cards | 12 icons: key, folder, editor, container, log scroll, deploy arrow, terminal, relay hops to a server (Proxy & Tor), assist bubble, config sliders, laptop, microphone |
| Tech | Stack of React, Electron, Monaco · xterm.js and ssh2 with a connecting arrow |
| Shortcuts | `.server-operator` folder with `deploy.serop`, `ops.serop`, `custom.serop`, and a pencil |
| Downloads | Laptop, monitor and terminal window, each with a download arrow |
| Changelog | A page of ticked entries |

### Motion (overrides the BeForth "static drawings" rule)
All motion lives in `draw.js` and the end of `styles.css`, and is disabled under `prefers-reduced-motion` (the hero packets are removed).

*   **Draw-in on scroll:** strokes draw one after another (`stroke-dashoffset` with `pathLength="1"`), then fills and labels fade in. Plays once per drawing.
*   **Live hero:** packets travel the connections (SMIL `animateMotion`), server LEDs and the terminal cursor blink.
*   **Hero entrance:** heading, lead and buttons rise in with a stagger.
*   **Scroll reveal:** cards, titles, code panels and pills fade up with a stagger. Elements already on screen at load are left alone.
*   **Hover:** cards lift with a signal border and a tilting icon, nav links get a sliding underline, buttons press down 1px, tech pills fill with signal.
*   **Navigation:** a 2px signal progress bar at the top, a scroll-spy highlight on the nav link for the section in view, and a darker nav border once scrolled.

### Honesty
No invented facts, numbers, clients or reviews. Everything on the page comes from the app, `LICENSE`, `package.json` or the in-app changelog (`src/components/changelogData.ts`, the source for `changelog.html` and "What's New"). The site credits BeForth in the footer and in the structured data.

### Search and answer engines
`index.html` and `changelog.html` carry a canonical URL on `https://server-operator-zeta.vercel.app`, Open Graph and Twitter tags, and JSON-LD (`WebSite`, `WebPage`, `SoftwareApplication`, `Organization`, `FAQPage` on the home page; `CollectionPage` and `BreadcrumbList` on the changelog). The visible FAQ section must match the `FAQPage` markup, so change them together. Also: `robots.txt`, `sitemap.xml`, `llms.txt` and `logo.png`. **A new page needs a `<link rel="canonical">`, its own JSON-LD and an entry in `sitemap.xml` and `llms.txt`.**

### Releasing
When a version ships, add its entry to `src/components/changelogData.ts` and to `website/changelog.html`, update "What's New" and the footer badge in `index.html`, and bump `softwareVersion` in the home page JSON-LD. The release workflow takes the codename for the release title from `changelogData.ts`.
