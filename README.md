# Synth — Swarm Deep Research

**Synth** is an AI-powered deep-research platform that orchestrates a swarm of
specialized agents (planners, researchers, analysts, writers) to produce
executive-ready reports on any topic.

Built for a hackathon with **Next.js 15**, **TypeScript**, **React 19**, and
**Tailwind CSS**.

## How it works

1. You enter a research topic.
2. A **planner** agent decomposes it into parallel research tasks.
3. A swarm of **researcher / analyst / writer** agents executes those tasks
   (respecting dependencies) across one or more loops.
4. Results are synthesized into a final executive report streamed to the UI.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (optional — demo mode works without keys)
cp .env.example .env.local

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment setup

| Variable        | Required | Description                                          |
| --------------- | -------- | ---------------------------------------------------- |
| `GROQ_API_KEY`  | No       | Groq API key for real LLM responses                 |
| `GEMINI_API_KEY`| No       | Google Gemini API key (alternative provider)        |
| `DEMO_MODE`     | No       | Defaults to demo mode; set `false` to use real LLMs |

`.env.local` is git-ignored — never commit real keys.

## Demo mode vs Groq

- **Demo mode** (default): works with zero setup. Returns realistic canned
  research responses so you can explore the UI without an API key.
- **Groq**: add `GROQ_API_KEY` to `.env.local` to get real, model-generated
  research using `llama-3.3-70b-versatile`.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # start production server
npm run lint     # run linter
```
