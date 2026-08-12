# Synth — Swarm Deep Research

**Synth** is a swarm-powered deep-research app. Give it a topic and it acts like
a boss editor: an **orchestrator planner** splits the topic into tasks, a
**swarm of parallel research agents** researches each task concurrently with
real web search, a **synthesizer** merges the findings into an executive
answer, and the pipeline **loops** to fill gaps — all streamed live to a
mission-control UI.

Built for a hackathon with **Next.js 15**, **TypeScript**, **React 19**,
**Tailwind CSS**, and **Three.js**.

## How it works

1. **Plan** — a planner agent decomposes the topic into 5–7 focused research
   tasks and states its reasoning for the split.
2. **Search** — each agent runs a real Tavily web search grounded in *its own*
   sub-task (not the raw topic), then synthesizes findings in its own words.
3. **Synthesize** — a synthesizer merges all findings into a tight executive
   answer (a 2–3 sentence direct answer + a few short sections), and flags any
   gaps it finds.
4. **Loop** — when gaps are detected, new agents are dispatched to cover them
   (up to 3 passes), and the report is re-synthesized.
5. **Report** — the final answer is streamed to the UI with per-agent sources.

## Features

- **Mission-control UI** — dark terminal aesthetic with a live Three.js swarm
  visual, animated aurora background, and glass cards.
- **Chat view** — streaming research conversation with a live swarm panel that
  shows each agent's thinking stages (`searching… → found N results → drafting`).
- **Kanban view** — a live board where agent cards move across
  *Queued → In Progress → Complete / Failed* in real time as events stream.
- **Resources view** — every unique source URL used across the run, grouped by
  the agent that cited it.
- **Gap detection** — a distinct amber "GAP DETECTED → redispatching" card makes
  the research loop legible.
- **Dark mode** — app-wide light/dark themes (system-aware, persisted, with a
  toggle in the header and login page).

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

# 2. Set up environment (optional — demo mode works with no key, but needs Tavily for real search)
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
  *real* Tavily search; only the final synthesis step is a deterministic
  template instead of an LLM call.
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
│   ├── Swarm3D.tsx             # Three.js particle swarm
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
