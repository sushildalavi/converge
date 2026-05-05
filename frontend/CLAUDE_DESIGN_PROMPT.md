# Prompt to paste into Claude Design / claude.ai

---

## Instructions for you (copy-paste this entire block)

I have a React + TypeScript + Vite + Tailwind CSS dashboard called **ReplayForge** — an async workflow debugging platform. I need you to **completely redesign the frontend UI** to be the most professional, polished SaaS dashboard possible.

### What the app does
- Ingests workflow events from applications
- Shows live metrics (total events, success rate, dead-lettered, retrying, latency)
- Displays a live event activity feed (real-time)
- Shows workflow timelines with retry history
- Has a Dead Letter Queue page (replay failed events)
- Has a Worker Health page (heartbeat monitor)

### Tech stack (keep these exactly)
- React 18 + TypeScript
- Tailwind CSS
- Framer Motion (for animations)
- Recharts (for charts)
- Lucide React (icons)
- Sonner (toasts)
- React Router v6

### API (backend already built — just call these endpoints)
```
GET  /api/metrics           → { total_events, succeeded, dead_lettered, retrying, queued, processing, active_workers, stale_workers, p50_attempt_duration_ms, p95_attempt_duration_ms, replay_success_rate, replay_requeued }
GET  /api/workflows         → [{ workflow_id, total_events, succeeded, dead_lettered, in_flight, has_failures, last_updated_at }]
GET  /api/workflows/{id}/timeline → { workflow_id, events: [{ event_type, service_name, status, attempt_count, last_error, created_at, attempts: [{ attempt_number, status, error_message, duration_ms, worker_name, started_at }] }] }
GET  /api/deadletters       → [{ id, event_type, workflow_id, service_name, last_error, created_at, replayed_at, replay_status }]
POST /api/deadletters/{id}/replay
GET  /api/workers           → [{ id, worker_name, status, last_heartbeat_at, current_event_id, is_stale }]
GET  /api/events/recent     → [{ id, event_type, service_name, workflow_id, status, attempt_count, last_error, updated_at }]
POST /api/demo/generate-workload?count=N → { workflows: N, events_sent: N*5 }
POST /api/incidents/{workflow_id}/summarize → { summary_text, model_name }
```

### Design requirements
- **Dark theme** — premium dark SaaS (think Linear, Vercel, Raycast, Planetscale)
- **Professional typography** — Inter for UI, JetBrains Mono for all numbers/IDs/timestamps
- **Sidebar navigation** — 200px wide, sticky
- **Live data** — poll /api/metrics every 4s, /api/events/recent every 2.5s
- **28+ animations** using Framer Motion:
  - Animated spring number counters
  - Staggered card entrances
  - Live feed items slide in
  - Page blur transitions
  - Rotating gradient border on hero card
  - Spotlight mouse-follow on cards
  - Worker heartbeat bar oscillation
  - Sidebar active pill slides with layoutId
  - Command palette spring open
  - etc.

### Pages to build
1. **Dashboard** — 8 KPI metric cards + area chart (event rate) + live activity feed + workflow table
2. **Workflow Detail** — SVG arc success rate + bar chart (attempts per step) + animated timeline
3. **Dead Letters** — table with animated replay buttons
4. **Workers** — card grid with heartbeat animations + SVG health arc

### Existing code (all files below — redesign keeping the same API calls and logic)

---

[PASTE THE CONTENTS OF FRONTEND_FOR_CLAUDE_DESIGN.md HERE]

---

## Now redesign this. Requirements:
1. Keep all API calls exactly the same
2. Keep all TypeScript types the same  
3. Keep React Router routes the same
4. Make the visual design dramatically better — more polished, more professional
5. Add at least 20 Framer Motion animations
6. Use a consistent design system (tokens in CSS variables)
7. Make every component look like it belongs in a $50k/year SaaS product
8. Output all changed files with their full content
