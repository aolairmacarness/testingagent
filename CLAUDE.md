# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"ai-testing" is a Next.js (App Router, `next` 16.x, React 19, Tailwind v4, TypeScript) app that generates test cases for a GitHub repository and (planned) turns them into Browserbase/Playwright browser scripts. The git repo and app live in `ai-testing/`; the parent `testingagent/` directory only holds a stub `package-lock.json` and `public/` assets.

**Next.js warning (from AGENTS.md):** this Next version has breaking changes versus common training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code. Note that middleware lives in `proxy.ts` (not `middleware.ts`).

## Commands

Run from `ai-testing/`:

- `npm run dev` / `npm run build` / `npm start`
- `npm run lint` (`next lint`)
- `npm run db:generate` / `npm run db:push` / `npm run db:studio` (drizzle-kit; reads `DATABASE_URL`, schema in `db/schema.ts`, migrations output to `./drizzle`)

There is no test runner configured.

## Architecture

- **Auth:** Clerk. `proxy.ts` and `app/layout.tsx` both check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`. If either is missing, they fall back to no-auth passthrough, so the app runs without Clerk. Sign-in/up pages are under `app/sign-in/[[...sign-in]]` and `app/sign-up/[[...sign-up]]`.
- **Database:** Neon serverless Postgres via Drizzle (`db/index.ts`, `neon-http` driver). `DATABASE_URL` falls back to a placeholder string so the app builds without a DB. Tables in `db/schema.ts`:
  - `users`: includes a `credits` balance, default 1000.
  - `repositories`: GitHub repo metadata plus `targetDomain` (default `http://localhost:3000/`) and a global instruction. The column is spelled `gloablInstruction` in code; keep that spelling unless you migrate.
  - `test_cases`: AI-generated cases (title, type, priority, `targetRoute`, `targetFiles`, `expectedResult`), plus Browserbase run state (`browserbaseScript`, `status`, `logs`, `sessionId`, `sessionUrl`).
  - Note that `test_cases.userId` and `repoId` are `varchar`, not FKs to `users`/`repositories`.
- **LLM:** Anthropic SDK (`claude-opus-5-5`, needs `ANTHROPIC_API_KEY`) is used for both pipeline steps; `@google/genai` is still in `package.json` but no longer imported.
  - `app/api/generate-test-cases/routes.tsx` generates test cases via a forced tool call. **The file is named `routes.tsx`, not `route.ts`, so Next will not serve it as an endpoint**; rename it if the endpoint 404s.
  - `app/api/test-cases/run/route.ts` generates the Playwright script and deducts credits (`70 + tokens/100`, capped at 100, tokens = input + output).
  - `app/api/test-cases/route.tsx`, `test-cases/settings/route.ts`, `user/route.tsx` are the other routes.
- **Other integrations:** `@browserbasehq/sdk` and `playwright-core` (remote browser runs), Stripe, axios. `app/api/github/` is an empty placeholder (`.gitkeep`).
- **UI:**
  - `app/page.tsx` is a large client-side landing page with inline design tokens (`C` object) and hooks.
  - `components/ui/` holds shadcn components (config in `components.json`).
  - `components/custom/` holds workspace components (`WorkspaceHeader`, `EmptyWorkspace`).
  - `context/UserDetailContext.tsx` is a React context for the signed-in user's DB record.
- Path alias: `@/*` maps to the `ai-testing/` root.

## Environment

Copy `.env.example` to `.env`. Variables: `NEXT_PUBLIC_APP_URL`, Clerk keys and sign-in/up URLs, `DATABASE_URL`, `ANTHROPIC_API_KEY`. Browserbase, Stripe and GitHub credentials are not in the example file; grep the routes for their names.
