# ReplayForge — Complete Frontend Redesign Prompt

Copy everything below this line and paste it into Claude (claude.ai), then attach or paste your frontend code files.

---

## YOUR TASK

You are a senior product designer and frontend engineer. Completely redesign the **ReplayForge** frontend — a dark-theme SaaS dashboard for debugging async workflow failures — using components and patterns from **21st.dev**, with a massive focus on micro-animations and professional polish.

The backend API is already built and working. You are **only redesigning the frontend** (React + TypeScript + Vite + Tailwind + Framer Motion). Do not change any API calls, route paths, or TypeScript types.

---

## WHAT REPLAYFORGE IS

A developer platform that:
- Ingests workflow events (e.g. checkout → payment → inventory → email → shipment)
- Processes them through Redis Streams workers with retries and exponential backoff
- Moves exhausted events to a dead-letter queue
- Shows live metrics, event timelines, retry histories, and worker heartbeats
- Lets operators replay dead-lettered events with one click

---

## DESIGN INSPIRATION (study these carefully)

### Primary references — match this quality exactly:
- **21st.dev** — animated components, glassmorphism, gradient borders, spotlight effects
- **Linear.app** — tight typography, monospace data, clean sidebar, minimal color usage
- **Vercel Dashboard** — clean dark surfaces, excellent information hierarchy
- **Raycast** — premium feel, keyboard-first, micro-interactions on everything
- **Resend.com** — beautiful dark SaaS, elegant tables, subtle borders

### Visual language:
- Background: `#030712` (near-black, not muddy grey)
- Surface: `#0c1220` (cards)
- Border: `rgba(255,255,255,0.08)` (extremely subtle)
- Accent: `#6366f1` (indigo — use sparingly)
- Text hierarchy: white → `#94a3b8` → `#475569` → `#1e293b`
- Numbers/IDs/timestamps: **JetBrains Mono** always
- UI labels/copy: **Inter** always
- Font sizes: 11–13px for most content, 15–17px for headings max
- Border radius: 8px cards, 6px buttons, 4px badges — never big rounded corners

---

## ANIMATIONS — IMPLEMENT ALL 40+ OF THESE

### Entrance animations (Framer Motion)
1. **Staggered card entrance** — KPI cards stagger in with `y: 20 → 0, opacity: 0 → 1`, each 55ms apart
2. **Page blur transition** — route changes use `filter: blur(4px) → blur(0)` + opacity
3. **Timeline node spring pop** — each node: `scale: 0 → 1` with spring stiffness 450, damping 18
4. **Attempt rows stagger** — each attempt row fades in with `delay: i * 0.04`
5. **Live feed slide-in** — new items enter from top: `y: -10 → 0` + indigo background flash that fades
6. **Chart entrance** — area chart container: `opacity: 0 → 1, y: 8 → 0` on mount
7. **Status bars fill** — horizontal bars: `scaleX: 0 → width%` with 0.8s ease-out, stagger per bar
8. **Card hover lift** — `whileHover: { y: -3 }` on all cards
9. **Command palette spring** — `scale: 0.94 → 1, y: -14 → 0, filter: blur(4px) → blur(0)` entrance
10. **Metric number ticker** — framer `useSpring` + `useTransform` — numbers animate to new values

### CSS keyframe animations
11. **Rotating gradient border** — use `@property --border-angle` + `conic-gradient` on hero card, rotates 4s infinite
12. **Double-ring live pulse** — sidebar LIVE indicator has two rings pinging at different delays
13. **Badge pulse dot** — processing/retrying status dots have CSS `animate-pulse`
14. **Shimmer skeleton** — loading skeletons sweep left→right gradient
15. **Gradient text shimmer** — key headers get animated gradient sweep

### Interactive animations
16. **Spotlight mouse-follow** — cards track mouse position with `radial-gradient` spotlight (CSS custom props `--mouse-x --mouse-y`)
17. **Button hover glow** — primary button: `box-shadow: 0 0 20px rgba(99,102,241,0.4)` on hover
18. **Button press scale** — `whileTap: { scale: 0.95 }` on every button
19. **Sidebar active pill layoutId** — framer shared layout: pill slides between nav items
20. **Command palette item hover** — `layoutId="cmd-pill"` background slides between items
21. **Replay button success flash** — on success: background pulses green, scale bounces
22. **Toggle/expand chevron** — rotates 180° with `animate: { rotate: open ? 180 : 0 }`
23. **Sparkline draw-in** — SVG `strokeDashoffset` animates from full length → 0 on mount

### Worker/data animations
24. **Heartbeat bar oscillation** — active workers: `scaleX: [1, 0.2, 1]` repeat:Infinity 1.8s
25. **SVG health arc draw** — `strokeDashoffset` animated with framer on worker fleet health ring
26. **Success rate arc draw** — same technique on workflow detail page
27. **Donut chart entrance** — pie segments animate in from 0 with stagger
28. **Number counter** — any number changing: count up/down with spring physics
29. **Worker status indicator** — active worker dot: ping animation with two overlapping rings
30. **Throughput chart live update** — new data points slide in from right as chart updates

### Micro-interactions
31. **Table row hover** — very subtle `background: rgba(255,255,255,0.018)` transition
32. **Link arrow reveal** — `ArrowUpRight` icon: `opacity: 0 → 100` on row/link hover
33. **Copy-to-clipboard flash** — if adding copy buttons: brief flash + checkmark swap
34. **Error banner accordion** — slide down with `height: 0 → auto` + blur-in
35. **Toast slide-up** — Sonner toasts: custom spring entrance from bottom-right
36. **Health badge transition** — header health badge color transitions smoothly between states
37. **Progress bar indeterminate** — loading states use animated gradient sweep
38. **Metric card accent line** — 1px top gradient line fades in on hover
39. **Workflow node connector** — timeline connector lines draw in top→bottom on page load
40. **Keyboard shortcut hint** — kbd badges in command palette entrance shimmer once

---

## PAGES TO BUILD

### 1. Dashboard (`/`)

**Layout — bento-style, NOT uniform grid:**
```
Row 1: [Total Events — HERO, large, gradient border, 2/4 width] [Succeeded] [Dead-lettered] [Workers]
Row 2: [Retrying] [Replay Success] [p50 Latency] [p95 Latency]
Row 3: [Area Chart — 3/5 wide — event rate, NOT cumulative] [Live Activity Feed — 2/5]
Row 4: [Status Horizontal Bars — 2/5] [Workflow Table — 3/5]
```

**Hero Total Events card:**
- CSS rotating gradient border (`@property --border-angle` conic-gradient)
- Spotlight mouse-follow effect
- Large 30px number with spring counter
- Inline SVG sparkline draws in on mount

**Area chart:**
- Shows events PROCESSED PER TICK (delta), not cumulative total
- Three areas: Succeeded (green), Dead-lettered (red), Retrying (orange)
- Clean axes, no chart junk
- Updates every 4s with smooth data transition

**Live Activity Feed:**
- Polls `/api/events/recent` every 2.5s
- New items animate in from top with indigo flash
- Service emojis: 🛒💳📦✉️🚚
- Monospace event type + status badge + workflow ID + timestamp
- Shows errors in red inline

**Status bars section:**
- Horizontal bars for: succeeded / queued / processing / retrying / dead-lettered
- Each bar: label left, animated width fill, count right
- All five bars animate in staggered on mount

**Workflow table:**
- Compact, information-dense
- Monospace workflow IDs in indigo
- Colored numbers (green for succeeded, red for DLQ, amber for in-flight)
- Status badge per row
- Rows stagger-fade in on load

### 2. Workflow Detail (`/workflows/:wfId`)

**Layout:**
```
[Back link]  [Workflow ID in mono]  [AI Summary button top-right]
[Succeeded N/Total] [Dead-lettered] [Total Attempts] [Total Duration]
[SVG Success Rate Arc — animated] [Attempts Per Step Bar Chart]
[Full Event Timeline]
```

**Success rate arc:**
- SVG circle with animated `strokeDashoffset`
- Color: green if >80%, orange if >50%, red otherwise
- Glow filter matching color
- Percentage animates up from 0

**Attempts per step bar chart:**
- Each bar colored by final outcome of that step
- Bars animate in from bottom on mount

**Event timeline:**
- Vertical timeline with colored nodes
- Nodes: spring pop in staggered by index
- Connector lines draw down from each node
- Clicking a row expands attempt history with smooth height animation
- Error messages shown inline in red
- Timestamps in monospace

**AI Summary panel:**
- Purple-tinted card that springs in when generated
- Shows "template fallback" or model name
- Loading state while fetching

### 3. Dead Letters (`/deadletters`)

**Layout:**
```
[Title + subtitle]
[3 stat cards: Total DLQ | Pending | Replayed] ← stagger in
[Full-width table]
```

**Table:**
- Event type (mono bold) / Workflow ID link / Service / Last Error (truncated, red) / Age / Status badge / Replay button
- Replay button: `idle → loading (spin) → success (green glow flash) → "replayed" badge`
- Rows stagger-fade in

### 4. Worker Health (`/workers`)

**Layout:**
```
[Title]
[Fleet health arc + 3 stat cards] ← stagger
[Worker cards grid — responsive, not table]
```

**Worker cards:**
- Each card: colored top accent line per status
- Live pulse ring for active workers (two-ring CSS animation)
- Animated heartbeat bar (oscillates for active, shrinks for stale)
- Status badge + processing event ID
- Cards lift on hover

---

## COMPONENT SPECIFICATIONS

### `MetricCard`
```tsx
interface Props {
  label: string
  value: number | string | null   // null = loading skeleton
  sub?: string
  icon?: LucideIcon
  trend?: string
  trendUp?: boolean
  accent?: 'indigo'|'emerald'|'rose'|'orange'|'amber'|'purple'|'sky'
  sparkData?: number[]  // renders inline SVG sparkline
  featured?: boolean    // activates rotating gradient border
}
```
- Spotlight mouse-follow always on
- Spring animated number when value changes
- SVG sparkline draws in with strokeDashoffset animation
- Top accent gradient line (1px, horizontal)
- `featured=true`: rotating conic-gradient border via CSS `@property`

### `EventStatusBadge`
```tsx
// Status → { background, text color, border, dot color, pulse? }
// Statuses: received|queued|processing|succeeded|failed|retrying|dead_lettered|replayed|cancelled
// processing and retrying: dot has animate-pulse
```

### `LiveFeed`
```tsx
// Polls /api/events/recent every 2.5s
// AnimatePresence: new items y:-8→0 + rgba(99,102,241,0.1) background flash → transparent
// Double-ring live indicator in header
// Emoji per service name
```

### `CommandPalette`
```tsx
// Opens: scale:0.94→1, y:-14→0, blur:4px→0
// layoutId="cmd-pill" slides between hovered items
// Keyboard: ↑↓ navigate, ↵ select, esc close
// Footer: shows keyboard shortcuts
```

### `WorkflowTimeline`
```tsx
// Each TimelineEvent:
//   - motion.div: initial x:-14, animate x:0, delay: idx*0.045
//   - Node: spring scale pop, delay idx*0.045+0.1
//   - Connector: gradient line from node color → transparent
//   - Click to expand: AnimatePresence height:0→auto
```

---

## CSS DESIGN TOKENS

```css
:root {
  --bg:         #030712;
  --surface:    #0c1220;
  --raised:     #101827;
  --border:     rgba(255,255,255,0.08);
  --border2:    rgba(255,255,255,0.13);
  --text:       #e2e8f0;
  --text-muted: #64748b;
  --text-dim:   #334155;
  --text-dimmer:#1e293b;
  --accent:     #6366f1;
  --accent-dim: rgba(99,102,241,0.12);
  --emerald:    #10b981;
  --rose:       #f43f5e;
  --orange:     #f97316;
  --amber:      #f59e0b;
  --sidebar-w:  210px;
  --header-h:   42px;
  --radius:     8px;
  --radius-sm:  6px;
}
```

---

## REQUIRED PACKAGES (already installed)

```json
{
  "react": "18.3.1",
  "framer-motion": "^11",
  "recharts": "^3",
  "lucide-react": "latest",
  "sonner": "latest",
  "axios": "1.7.7",
  "react-router-dom": "6.28.0",
  "tailwindcss": "3.4.14"
}
```

---

## API REFERENCE (do not change any of these calls)

```typescript
// GET /api/metrics
type MetricsOut = {
  total_events: number; succeeded: number; failed: number;
  dead_lettered: number; retrying: number; queued: number; processing: number;
  replay_requeued: number; replay_success_rate: number;
  active_workers: number; stale_workers: number;
  avg_attempt_duration_ms: number | null;
  p50_attempt_duration_ms: number | null;
  p95_attempt_duration_ms: number | null;
}

// GET /api/workflows
type WorkflowSummaryOut = {
  workflow_id: string; total_events: number; succeeded: number;
  failed: number; dead_lettered: number; in_flight: number;
  has_failures: boolean; last_updated_at: string | null;
}

// GET /api/workflows/:id/timeline
type WorkflowTimelineOut = {
  workflow_id: string;
  events: Array<{
    id: string; event_type: string; service_name: string; status: string;
    attempt_count: number; max_attempts: number; last_error: string | null;
    created_at: string; updated_at: string;
    attempts: Array<{
      id: string; attempt_number: number; worker_name: string | null;
      status: string; error_message: string | null; duration_ms: number | null;
      started_at: string; finished_at: string | null;
    }>;
  }>;
}

// GET /api/deadletters
type DeadLetterOut = {
  id: string; event_id: string; workflow_id: string; event_type: string;
  service_name: string; reason: string; last_error: string | null;
  created_at: string; replayed_at: string | null; replay_status: string | null;
}

// GET /api/workers
type WorkerOut = {
  id: string; worker_name: string; status: string;
  last_heartbeat_at: string; current_event_id: string | null; is_stale: boolean;
}

// GET /api/events/recent
type RecentEvent = {
  id: string; workflow_id: string; event_type: string; service_name: string;
  status: string; attempt_count: number; last_error: string | null;
  updated_at: string | null;
}
```

---

## RULES — FOLLOW THESE EXACTLY

1. **Keep all API endpoint paths identical** — `/api/metrics`, `/api/workflows`, etc.
2. **Keep all TypeScript types identical** — same field names, same shapes
3. **Keep React Router routes** — `/`, `/workflows/:wfId`, `/deadletters`, `/workers`
4. **Use Framer Motion for ALL animations** — no CSS transitions for motion
5. **Use `usePolling` hook** (already built):
   ```typescript
   // polls fn every intervalMs, returns { data, loading, error, refresh }
   function usePolling<T>(fn: () => Promise<T>, intervalMs: number)
   ```
6. **Every number** → JetBrains Mono, tabular-nums
7. **Every timestamp/ID** → JetBrains Mono
8. **No `any` types** unless absolutely required
9. **Output complete files** — not diffs, not snippets. Full file content for every changed file.
10. **Files to output:**
    - `src/index.css` (complete design system)
    - `src/App.tsx`
    - `src/components/Animated.tsx`
    - `src/components/MetricCard.tsx`
    - `src/components/EventStatusBadge.tsx`
    - `src/components/LiveFeed.tsx`
    - `src/components/Header.tsx`
    - `src/components/CommandPalette.tsx`
    - `src/pages/Dashboard.tsx`
    - `src/pages/WorkflowDetail.tsx`
    - `src/pages/DeadLetters.tsx`
    - `src/pages/WorkerHealth.tsx`
    - `src/hooks/usePolling.ts` (keep unchanged)
    - `src/types.ts` (keep unchanged)
    - `src/api/client.ts` (keep unchanged)

---

## CURRENT CODE (for reference — redesign all of this)

[Paste the contents of FRONTEND_FOR_CLAUDE_DESIGN.md here]
