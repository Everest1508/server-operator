# Design Guidelines - Server Operator

This document outlines the core design systems, tokens, and components that define the visual layout and user experience of the **Server Operator** application.

---

## 1. Visual Theme & Style Tokens

Server Operator uses a dark, premium, VS Code-inspired theme designed to fit development environments. The styling is defined using Tailwind CSS variables:

*   **Background Primaries**:
    *   `--bg-primary` (`#1e1e1e`): Main editor container and content area background.
    *   `--bg-secondary` (`#252526`): Sidebar and bottom panels background.
    *   `--bg-tertiary` (`#2a2d2e`): Hover item states, sub-cards, and inline menus.
    *   `--bg-activity` (`#333333`): Far-left Activity Bar container.
*   **Borders**:
    *   `--border` (`#3c3c3c`): Separation borders, panel margins, and inputs.
*   **Typography & Colors**:
    *   `--text-primary` (`#cccccc`): Standard text labels and active menu items.
    *   `--text-secondary` (`#858585`): Subheaders, muted descriptions, and inactive states.
    *   `--text-muted` (`#6e7681`): Placeholders, metadata, and timestamps.
    *   `--font-sans`: Monospaced font family (`JetBrains Mono`, `Fira Code`, `SF Mono`, `monospace`) to maintain code readability across all textareas and editors.
*   **Accents**:
    *   `--accent` (`#0078d4`): Primary blue branding, active focus rings, and action buttons.
    *   `--accent-hover` (`#3794ff`): Lighter hover accent.
    *   `--success` (`#4ec9b0`): Green badges, online status indicators, and saved notifications.
    *   `--error` (`#f14c4c`): Red warning text, connection errors, and delete operations.

---

## 2. Layout Structure & Responsive Rules

The layout is a 3-pane responsive IDE:
1.  **Activity Bar** (Fixed, 48px width): Navigates active views.
2.  **Sidebar** (Resizable, 180px–480px width): Contains list trees, servers, docker actions, or notes.
3.  **Editor Area** (Flexible flex-1): Houses file editor tabs, terminal outputs, and logs.

### Scaling & Boundary Constraints
To handle small sidebar dimensions (e.g. at the minimum width of 180px):
*   Use `min-w-0` and `w-full` on all flex columns to enable standard flex calculations.
*   Enforce `truncate` and `whitespace-nowrap` on header labels so titles collapse with ellipses (`...`) instead of wrapping and overlapping adjacent icons.
*   Apply `shrink-0` to badges, status indicators, and buttons to keep them aligned on a single row.

---

## 3. Custom Tooltip Component

Native browser tooltips (`title` attribute) suffer from a built-in display delay (500ms+). To show hints immediately and match the app theme, we use the custom `<Tooltip>` component (`src/components/Tooltip.tsx`):

### Style
*   **Background**: `var(--bg-tertiary)` (`#2a2d2e`)
*   **Border**: `1px solid var(--border)` (`#3c3c3c`)
*   **Shadow**: `shadow-xl` to stand out on dark backdrops.
*   **Text Size**: `text-[10px]` with tight line height.
*   **Trigger**: Instantly appears on `mouseenter` / `focus` and disappears on `mouseleave` / `blur`.
*   **Animations**: Built-in CSS transition fade-in.

### Usage
Wrap any element in `<Tooltip>`:
```tsx
import { Tooltip } from './Tooltip';

<Tooltip content="Helper explanation goes here" position="top">
  <button>Hover Me</button>
</Tooltip>
```

---

## 4. Notes Persistence & Synchronization

*   **General Notes** are stored in `localStorage` under `server-operator:general-notes`.
*   **Server Notes** are stored in `localStorage` scoped per server ID: `server-operator:server-notes:<serverId>`.
*   **Autosave**: Sidebar inputs save automatically using an 800ms debounce timer to prevent continuous disc writes.
*   **Monaco Integration**: Notes can be opened inside the Monaco Editor via the virtual paths `notes://general` and `notes://server`.
*   **Bidirectional Sync**: Real-time synchronization between the sidebar inputs and Monaco is achieved via the `notes-updated` browser event. When either editor is updated, the changes propagate reactively, ensuring both inputs remain in sync.
