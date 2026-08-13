# Synth — Swarm Deep Research

<p align="center">
  <img src="https://img.shields.io/badge/Next.js%2015-black?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React%2019-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Three.js-black?logo=threedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind%20CSS-38BDF8?logo=tailwindcss&logoColor=white" />
</p>

**Synth** is a swarm-powered deep-research engine. Give it a topic and it acts like a
boss editor: an **orchestrator** splits the topic into tasks, a **swarm of parallel
research agents** investigates each one concurrently with real web search, a
**synthesizer** merges the findings into an executive answer, and the pipeline
**loops** to fill any gaps — all streamed live to a mission-control UI.

> Built for a hackathon with **Next.js 15**, **React 19**, **TypeScript**,
> **Tailwind CSS**, and **Three.js**.

## Demo

1. Open the app and sign in with any email (demo build — no password).
2. Pick a suggested topic or type your own, then hit **Deploy swarm →**.
3. Watch the swarm: an orchestrator core with orbiting agents that change color as
   they work, and particles that flow along the connections.
4. When it finishes, the **mission-complete** summary drops the executive report
   with every source cited.

Dark mode makes the 3D swarm pop the most — the toggle is in the top-right.

## How it works

1. **Plan** — a planner agent decomposes the topic into 5–7 focused research tasks
   and states its reasoning for the split.
2. **Search** — each agent runs a real Tavily web search grounded in *its own*
   sub-task (not the raw topic), then synthesizes findings in its own words.
3. **Synthesize** — a synthesizer merges all findings into a tight executive answer
   (a direct answer + short sections) and flags any gaps.
4. **Loop** — when gaps are detected, new agents are dispatched to cover them
   (up to 3 passes), and the report is re-synthesized.
5. **Report** — the final answer streams to the UI with per-agent sources.

## Features

- **Hero 3D swarm** — a central orchestrator core (layered rings + energy pulse)
  with one orbiting node per agent, colored by state (`working` = cyan pulse,
  `done` = green ✓, `failed` = red ✕) and particles flowing along the connections.
- **Mission progress header** — live `Planning → Research → Synthesis` bar with
  `N active · N completed · N failed` counts above the swarm.
- **Mission-complete payoff** — the final report opens with a
  `✓ agents · ✓ sources · ✓ loops` completion banner.
- **Chat view** — streaming conversation with per-agent thinking stages
  (`searching… → found N results → drafting`).
- **Kanban view** — live board where agent cards move across
  *Queued → In Progress → Complete / Failed* in real time.
- **Resources view** — every unique source URL used across the run, grouped by agent.
- **Gap detection** — a distinct amber "GAP DETECTED → redispatching" card makes
  the research loop legible.
- **Dark mode** — light/dark/system themes (persisted, with a toggle).
- **Interactive polish** — cursor-following 3D tilt on cards, hover-lift buttons,
  quick-start topic chips, and `⌘/Ctrl + Enter` to deploy.

## Tech stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, Three.js |
| Language | TypeScript |
| LLM | Groq (`llama-3.3-70b-versatile`) via `fetch` |
| Search | [Tavily](https://tavily.com) web search |
| Streaming | Server-Sent Events (SSE) |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (optional — demo mode needs only Tavily for real search)
cp .env.example .env.local

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign in with any email
(demo build, no password) and launch a swarm.

## Environment

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `PROVIDER` | No | `demo` (default) or `groq` |
| `GROQ_API_KEY` | No | Groq API key for real LLM synthesis |
| `TAVILY_API_KEY` | No | Tavily API key for real web search (used by both demo and groq modes) |

`.env.local` is git-ignored — never commit real keys. `.env.example` contains
placeholders only.

### Demo vs Groq

- **Demo mode** (`PROVIDER=demo`) — runs with no Groq key. Agents still perform
  *real* Tavily search; only the final synthesis step is a deterministic template
  instead of an LLM call.
- **Groq mode** (`PROVIDER=groq`) — full LLM pipeline: the planner, researchers,
  and synthesizer all use `llama-3.3-70b-versatile`, grounded in Tavily results.

## Architecture

```
src/
├── app/
│   ├── api/swarm/route.ts      # POST /api/swarm → SSE stream
│   ├── login/                  # login page (any email)
│   ├── dashboard/              # main console (chat / kanban / resources)
│   ├── layout.tsx              # theme init + aurora background
│   └── globals.css             # design tokens, dark mode, animations
├── components/
│   ├── ChatView.tsx            # streaming research conversation + live swarm panel
│   ├── KanbanView.tsx          # live kanban board
│   ├── ResourcesView.tsx       # sources grouped by agent
│   ├── Swarm3D.tsx             # Three.js agent-orchestrator swarm
│   ├── Tilt.tsx                # cursor-following 3D tilt wrapper
│   └── ThemeToggle.tsx         # light/dark/system toggle
└── lib/
    ├── types.ts                # shared contracts (Task, Plan, Gap, Report, Source, SwarmEvent)
    ├── engine/swarm.ts         # pipeline: plan → swarm → synthesize → loop
    ├── providers/index.ts      # GroqProvider + DemoProvider + Tavily search
    ├── runModel.ts             # derives UI state from SSE events
    └── history.ts              # localStorage session + run history
```

### Data contracts

```ts
interface Task {
  id: string;
  title: string;
  status: 'pending' | 'working' | 'done' | 'failed';
  result?: string;
  error?: string;
  sources?: Source[];
  thinking?: string;
}
interface Plan { tasks: Task[]; reasoning: string }
interface Gap  { missing: string[]; reasoning: string }
interface Report { summary: string; sections: { title: string; content: string }[]; loopsUsed: number }
```

### SSE events

`plan_ready` → `task_update` (×N, live status) → `agent_thinking` (per-agent
progress) → `gap_detected` → `redispatch` → `final_report` (with `error` for
failures).

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # start production server
```

## License

Hackathon demo — feel free to fork and remix.
