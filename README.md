# Capitalia

Capitalia is an AI-first personal finance assistant. It is not a simple expense tracker:
the product goal is to help people keep their whole financial life organized with as
little manual effort as possible.

## Product Principles

- Mobile first.
- Premium, calm and trustworthy experience.
- Clean, scalable and typed code.
- Professional architecture prepared to become a SaaS.
- Database changes only through SQL migrations.
- Automation-friendly delivery with GitHub, Vercel and CI.

## Technical Stack

- React + Vite + TypeScript.
- Supabase as backend platform.
- PostgreSQL managed through migrations in `supabase/migrations`.
- PWA support through `vite-plugin-pwa`.
- ESLint + Prettier for code quality.
- Vercel-ready frontend deployment.
- OpenAI API planned for future assistant features.

## Project Structure

```text
src/
  app/          App composition, providers and route wiring.
  assets/       Frontend assets imported by the app.
  features/     Product domains. Each feature owns its UI, state and logic.
  shared/       Reusable components, config, hooks, libraries, styles and types.
  types/        Global TypeScript declarations.
supabase/
  migrations/   SQL migrations. No manual database changes.
public/         Static public assets and PWA icons.
```

## Architecture Notes

The codebase starts with a feature-first structure. Product domains such as finance,
insights and onboarding live under `src/features`, while app-level composition remains
in `src/app`. Shared code is intentionally separated to avoid coupling future domains
too early.

Supabase is prepared as a platform dependency, but runtime integration is not implemented
yet. When database changes are needed, create a timestamped SQL file inside
`supabase/migrations` and review it through Git before applying it.

The app is configured as a PWA from day one because Capitalia is mobile first and should
eventually behave like a high-quality installed assistant.

## Environment

Copy `.env.example` to `.env.local` and fill in the values when a Supabase project exists.
Vite only exposes variables prefixed with `VITE_` to browser code.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_ENV=local
```

`VITE_SUPABASE_URL` is the public Supabase project URL.

`VITE_SUPABASE_ANON_KEY` is the public anonymous client key. It is safe to use in the
frontend only when Row Level Security is configured correctly. Never expose
`SUPABASE_SERVICE_ROLE_KEY`, database passwords, OpenAI keys, Vercel tokens or provider
secrets in frontend code or `VITE_*` variables.

In Vercel, configure the same variables in:

```text
Project Settings -> Environment Variables
```

## Development

```bash
npm install
npm run dev
```

## Quality Commands

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Database Workflow

All database changes must be represented as SQL migrations in:

```text
supabase/migrations
```

Use descriptive timestamped filenames, for example:

```text
20260704173000_create_profiles.sql
```

Do not make manual schema changes in the Supabase dashboard.

## Deployment Direction

The project is prepared for Vercel deployment. Required environment variables should be
configured in Vercel once Supabase credentials exist.
