# TASK
Build the MVP of a subscription tracker web app in this folder, from scratch. Read `CLAUDE.md` first and follow it. It is the source of truth for stack, principles, and status labels.

# OBJECTIVE
A user signs up, adds subscriptions in under 10 seconds, sees monthly/yearly totals in their home currency, sees upcoming renewals (list and calendar), and receives email reminders before renewals. Everything runs on free tiers only.

# CURRENT STATE
- Empty project folder except `CLAUDE.md` and this file. No code, no Supabase project, no deployed services.
- Nothing is COMPLETED. Do not claim otherwise.

# REQUIREMENTS

## 1. Auth
- Supabase Auth: email/password and Google. Protected routes redirect to login.
- `profiles` row created on signup: `home_currency` (default PHP), `timezone` (default Asia/Manila).

## 2. Subscriptions CRUD
Fields: name, amount, currency (ISO 4217), cycle (weekly/monthly/yearly/custom with `interval_count`), `next_renewal` date, category, payment method, status (active/trial/paused/cancelled), notes.
- User-defined categories and payment methods with sensible defaults.
- Deleting a category or payment method forces reassignment to another; nothing is orphaned.

## 3. Quick-add (rule-based, NO LLM)
A text box such as `Netflix ₱549 monthly on the 15th` or `Spotify $11.99 yearly`.
- Parse: name, amount, currency (symbol or code), cycle, day-of-month/date.
- Output a prefilled form with per-field confidence; the user must confirm before saving.
- Unparseable input falls back to a blank manual form. Isolate the parser in `lib/parser` as a pure function.

## 4. Dashboard
- Monthly and yearly totals in home currency (normalize: yearly ÷ 12, weekly × 52/12).
- Upcoming renewals (next 7 and 30 days).
- Spend by category chart.
- Real empty states. No fake or placeholder data.

## 5. Calendar view
Month grid showing renewals per day; tap a day to see its subscriptions.

## 6. Multi-currency
- Fetch rates from a free, no-key exchange-rate API, cache once per day in `exchange_rates`.
- Verify the API's real response shape from its docs before coding against it.
- If a currency is unsupported or rates are unavailable, use the last stored rate and show a visible notice; if none exists, exclude that item from totals and say so.

## 7. Reminders
- Daily job (Vercel Cron, once/day) at `/api/cron/daily`, protected by a `CRON_SECRET` header.
- Steps: roll overdue `next_renewal` forward, write a `payments` row, then send reminders 1/3/7 days before renewal per user setting.
- Idempotent: unique key on (subscription_id, renewal_date, days_before) in a `reminder_log`. Re-running the job must never double-send or double-record.
- Email via Resend free plan behind an interface. Provide a log-only driver for local dev and for when no verified domain is configured.

## 8. CSV import/export
Export all subscriptions; import with validation and a preview of rows and errors before commit.

## 9. Settings
Home currency, timezone, reminder days, categories, payment methods, export, delete account and all data.

# CONSTRAINTS
- Free tier only. Do not add paid services, paid APIs, or billing/Stripe code.
- No LLM or AI features. No bank linking. No team/sharing features.
- Do not hardcode external API assumptions (FX, Resend) until verified against current docs; isolate each behind an interface.
- Secrets only via env vars. Provide `.env.example`; never commit `.env*`.
- Money: integer minor units or `numeric`, never floats. Dates stored UTC, rendered in user timezone.
- RLS on every table, scoped to `user_id`. Validate all input server-side (Zod).
- Do not build anything listed under "Do not build prematurely" in `CLAUDE.md`.
- Do not invent external API behavior. Where something is unconfirmed, mark it WAITING ON EXTERNAL PARTY.
- Keep changes scoped to this project. Understand what exists before editing.

# IMPLEMENTATION
Work in this order, and stop to summarize after each phase:
1. **Scaffold:** Next.js + TS + Tailwind + shadcn/ui, lint, typecheck, test runner (Vitest), `.env.example`, update the Commands section in `CLAUDE.md`.
2. **Schema:** SQL migrations in `supabase/migrations/` for `profiles`, `subscriptions`, `payments`, `categories`, `payment_methods`, `reminders`, `reminder_log`, `exchange_rates`, with RLS policies and default seed categories.
3. **Domain logic (`lib/`):** `renewals` (next-date calc, month-end, timezone), `currency` (normalize, convert), `parser`, `csv`. Pure and unit-tested before any UI.
4. **Auth and CRUD UI.**
5. **Quick-add, dashboard, calendar.**
6. **FX fetch and cache.**
7. **Daily cron, reminders, email interface and log-only driver.**
8. **CSV import/export, settings, account deletion.**
9. **Docs:** README with setup steps for free Supabase, Vercel Hobby, and Resend; update `CLAUDE.md` status labels to reflect only what is actually done and tested.

# TESTING
- Unit tests required for: next-renewal calc (including Jan 31 → Feb 28, leap year, DST-free UTC handling, custom intervals), monthly normalization, currency conversion and missing-rate fallback, quick-add parser (at least 15 varied inputs including failures), CSV parsing/validation.
- Cron idempotency test: run the job twice for the same day and assert one payment row and one reminder per (subscription, renewal date, days_before).
- RLS check: user A cannot read or write user B's rows (document how it was verified).
- Run lint, typecheck, and tests before declaring any phase done. Fix root causes; do not suppress errors.

# ACCEPTANCE CRITERIA
- A new user can sign up, add a subscription via quick-add in under 10 seconds, and see correct totals, upcoming renewals, and the calendar entry.
- Totals are correct across mixed currencies, with a visible notice when rates are stale or missing.
- The daily job is safe to run repeatedly and produces exactly one reminder per due item.
- No paid dependency, no secrets in the repo, RLS enabled on all tables.
- All tests pass; lint and typecheck are clean.

# DELIVERABLE SUMMARY
End with a concise summary containing:
- What was actually completed and tested (COMPLETED), with test results.
- What is PLANNED but not done.
- What is WAITING ON EXTERNAL PARTY (e.g. verified email domain, Supabase/Vercel/Resend account setup).
- Any deviations from this prompt and why.
- Exact commands to run locally and to deploy.
