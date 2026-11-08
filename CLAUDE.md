# CLAUDE.md — Subscription Tracker

Web app for tracking recurring subscriptions: what you pay for, when it renews, what to cancel. Inspired by Finny (AI Money Manager, iOS), but focused on subscriptions, not general expense tracking.

**Status:** MVP code written; verified by unit tests and an in-process Postgres only. Not yet run against a real Supabase project or deployed. Nothing below is COMPLETED unless marked.

## Product

- **Goal:** Add a subscription in under 10 seconds; get reminded before every renewal.
- **Users:** Individuals/freelancers with 10-40 subscriptions in mixed currencies.
- **Privacy stance:** No bank linking in MVP. Minimal data. Clear export and delete.
- **Differentiator:** Fast capture (natural-language add, later scan/email forward) and a calm, uncluttered UI.

## Stack (free tier only)

Every service must be usable at $0. Do not add a paid dependency without approval.

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (all open source)
- Supabase free plan: Postgres, Auth (email + Google), RLS. Free projects can pause after inactivity and have size limits; verify current limits.
- Vercel Hobby (free) for hosting. Hobby is for non-commercial use and limits cron to once per day, which is enough for the daily job. Revisit before charging anyone.
- Resend free plan for reminder emails. Sending to users other than the account owner needs a verified domain (WAITING ON decision: a domain may cost money). Until then use dev-mode/log-only email.
- Exchange rates: a free, no-key API (e.g. Frankfurter, ECB data), cached daily in the database. Verify the response shape against its docs before hardcoding.
- Quick-add parsing in the MVP is rule-based (no LLM, no paid API). LLM features are FUTURE / OPTIONAL.
- Billing: none in the MVP. Stripe availability for Philippine businesses is unverified, so payments stay out of scope until decided.

## Scope and status labels

Use these labels consistently. Never promote PLANNED or FUTURE work to COMPLETED.

- **COMPLETED**: confirmed implemented and tested
- **PLANNED**: intended, not confirmed implemented
- **WAITING ON EXTERNAL PARTY**: needs credentials, APIs, approval, or input from someone else
- **FUTURE / OPTIONAL**: useful, not currently required

### MVP status (as of 2026-11-08)

**COMPLETED** (implemented and covered by passing tests; `npm run lint`, `typecheck`, `test`, `build` all clean, 98 tests):
- Renewal date math: month-end, leap years, custom intervals, anchor day, roll-forward (`lib/renewals.ts`)
- Money/currency: integer minor units, monthly normalization, conversion, missing/stale-rate handling (`lib/money.ts`, `lib/currency.ts`)
- Rule-based quick-add parser with per-field confidence (`lib/parser`)
- CSV export/import validation with preview errors (`lib/csv.ts`)
- Daily job logic is idempotent (payments + reminder_log unique keys), tested with an in-memory store (`lib/cron/daily.ts`)
- SQL schema + RLS policies verified against PGlite: cross-user read/write blocked, no orphaned categories (`tests/rls.test.ts`)

**PLANNED** (code exists, NOT verified end to end; needs a real Supabase project to confirm):
- Auth (email + Google), subscriptions CRUD UI, dashboard, calendar, settings, CSV import/export UI, account deletion
- Supabase-backed cron store, FX refresh against the live API, `/api/health`
- No browser/E2E tests exist yet. RLS has not been checked on real Supabase.

**WAITING ON EXTERNAL PARTY**:
- Supabase project + keys, Google OAuth client, Vercel project, Resend verified domain (until then `EMAIL_DRIVER=log`)

### V2 (FUTURE / OPTIONAL)
Receipt/screenshot scan, email-forward inbox, free-trial tracker, price-change history, shared subscriptions, budget cap, tags/search, PWA push, Telegram/Discord bot.

### V3 (FUTURE / OPTIONAL)
Gmail/Outlook receipt detection, AI insights, cancel guides, bank-statement upload, mobile wrapper.

### Do not build prematurely
Billing/payments of any kind, LLM/AI features, paid services, Kubernetes, queues/Kafka/RabbitMQ, microservices, multi-tenant/team RBAC, extra OAuth providers, bank integrations. Add only when a requirement exists.

## Data model (core)

`profiles`, `subscriptions`, `payments` (history incl. price changes), `categories`, `payment_methods`, `reminders`, `exchange_rates`. `inbound_emails` is V2.
All user tables carry `user_id` with RLS enforced. Deleting a category or payment method must reassign entries to another one; never orphan.

## Core logic rules

1. **Next renewal:** advance by cycle; handle month-end (Jan 31 → Feb 28) and user timezone.
2. **Daily cron:** roll renewals forward, write a `payments` row, then send reminders. Must be **idempotent**; log every send.
3. **Normalization:** convert to monthly equivalents in the home currency (yearly ÷ 12, weekly × 52/12) for totals.
4. **Quick-add parser (MVP, rule-based, no LLM):** return strict JSON (name, amount, currency, cycle, date, confidence). The user always confirms before saving.

## Engineering principles

- **Architecture:** modular, reusable components, clear separation of concerns, vendor-specific logic isolated (email, FX, LLM, payments behind interfaces).
- **Security:** never expose secrets; use env vars only, never commit `.env*`. Validate input (Zod) and auth on every route. Redact sensitive data in logs. Secure defaults. Verify RLS for every new table.
- **Reliability:** idempotent jobs, retries with backoff, error recovery, health check endpoint, automated tests for date/renewal/currency logic.
- **Operations:** structured logs with correlation IDs; clear empty states.
- **No fake data:** no fake production data, metrics, transactions, or logs. Use runtime-driven empty states. Seed data only in clearly labeled dev seeds.
- **External APIs:** don't hardcode assumptions about FX, email, or LLM provider behavior until verified against their docs.
- Understand existing code before changing it. Avoid overengineering and feature creep.

## Working conventions

- Understand the current architecture first; keep changes minimal and scoped to the task. Do not modify unrelated systems.
- Run lint, typecheck, and tests before declaring work done. Fix root causes, don't suppress errors.
- Money: store amounts as integer minor units (or `numeric`), never floats. Store currency as ISO 4217 code. Store dates as UTC; render in user timezone.
- Migrations are SQL files in `supabase/migrations/`; never edit applied migrations, add new ones.
- Prefer server components; client components only where interactivity requires.
- UI: calm, uncluttered, mobile-first, accessible (WCAG AA). Use shadcn/ui components and Tailwind tokens; no ad-hoc styling systems.
- Commit messages: concise, imperative.

## Suggested structure (PLANNED)

```
app/            # routes (dashboard, subscriptions, calendar, settings)
components/     # UI components
lib/            # domain logic: renewals, currency, parsing, email
supabase/       # migrations, seed, RLS policies
tests/          # unit tests for lib/ domain logic
```

## Commands

```
npm run dev        # local dev server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # next typegen + tsc --noEmit
npm test           # vitest run (tests/**/*.test.ts)
npm run test:watch
```

Copy `.env.example` to `.env.local` before running against Supabase. Note: Next.js here is v16 (see `AGENTS.md`); check `node_modules/next/dist/docs/` before using framework APIs from memory.

## Timeline (target, PLANNED)

- Wk 1: schema, auth, CRUD, dashboard
- Wk 2: renewal engine, cron, reminders, multi-currency
- Wk 3: calendar, quick-add parser, import/export, polish
- Wk 4: landing page, beta (~20 users); no billing
- Wk 5-8: V2

## Known risks

- Parsing errors: always require confirmation and show confidence.
- Reminder reliability: idempotent cron, logged sends.
- Crowded market: win on capture speed and clarity, not feature count.

## Reference

Finny: https://apps.apple.com/us/app/finny-ai-money-manager/id6736472735
Notable Finny traits to learn from: recurring rules with pre-due reminders, multi-currency (150+) with auto rates, budgets with rollover, natural-text entry, local-first privacy, free tier plus a low-priced Pro (~$3.49/mo, $24.99/yr).
