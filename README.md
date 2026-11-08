# Subscription Tracker

Track what you pay for, when it renews, and what to cancel. Next.js (App Router) + Supabase + Tailwind/shadcn. Runs on free tiers only.

Status labels (COMPLETED / PLANNED / WAITING ON EXTERNAL PARTY) are defined in [CLAUDE.md](CLAUDE.md), which is the source of truth for scope.

## Run locally

```bash
npm install
cp .env.example .env.local     # then fill it in (see below)
npm run dev                    # http://localhost:3000
```

Without Supabase keys the app shows a **Setup required** page instead of failing.

### 1. Supabase (free)

1. Create a project at <https://supabase.com> (free plan).
2. **SQL Editor**: paste and run `supabase/migrations/20261108000001_initial_schema.sql`.
3. **Project Settings, API**: copy the project URL, the anon key and the service-role key into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
   The service-role key bypasses RLS: keep it server-side, never commit it.
4. **Authentication, URL Configuration**: add `http://localhost:3000/auth/callback` (and your Vercel URL later) to Redirect URLs.
5. For quick local testing you may turn off **Confirm email** under Authentication, Providers, Email. Leave it on in production.
6. Google sign-in (optional): create an OAuth client in Google Cloud, enable the Google provider in Supabase and paste the client id/secret. The button fails until this is done.

Never edit an applied migration. Add a new file in `supabase/migrations/` instead.

### 2. Daily job and reminders

`GET /api/cron/daily` (scheduled in `vercel.json`, once a day at 00:00 UTC) refreshes exchange rates, rolls overdue renewals forward, writes `payments` rows and sends reminders. It requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically when `CRON_SECRET` is set). Set `CRON_SECRET` to a random string of 16+ characters:

```bash
openssl rand -hex 32
curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/daily   # run it by hand
```

It is idempotent: running it again the same day writes no duplicate payments and sends no duplicate reminders.

### 3. Email (Resend free plan)

By default `EMAIL_DRIVER=log`: reminders are only written to the server log (addresses masked). To send real email:

1. Create a Resend account, create an API key.
2. Verify a sending domain in Resend and choose a from-address on it. **WAITING ON EXTERNAL PARTY**: until a domain is verified, Resend will not deliver to arbitrary recipients; keep the log driver.
3. Set `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`.

### 4. Deploy to Vercel (Hobby)

1. Push this folder to a Git repository and import it at <https://vercel.com>.
2. Add all variables from `.env.example` in Project Settings, Environment Variables (`NEXT_PUBLIC_SITE_URL` = your production URL).
3. Add the production URL + `/auth/callback` to Supabase Redirect URLs.
4. Deploy. Vercel Cron picks up `vercel.json`. Hobby allows once-per-day crons, which is what this uses.

## Commands

```bash
npm run dev | build | start
npm run lint
npm run typecheck
npm test
```

## Tests and how security was verified

- `tests/renewals`, `currency`, `parser`, `csv`: pure domain logic (month-end, leap years, custom intervals, normalization, missing-rate fallback, 25+ quick-add inputs including failures, CSV validation).
- `tests/cron.test.ts`: runs the daily job twice and asserts one payment per renewal date and one reminder per (subscription, renewal date, days before).
- `tests/rls.test.ts`: applies the real migration to an in-process Postgres (PGlite) and checks that user A cannot read, update, delete or insert user B's rows, that `payments`/`reminder_log`/`exchange_rates` are read-only to users, that RLS is enabled on every table, and that categories cannot be orphaned. The test was mutation-checked: loosening a policy makes it fail.
  Limits: PGlite stands in for Supabase (`auth.uid()` and roles are stubbed), so also do a manual check on your real project: sign up two users and confirm each sees only their own data.

## Third-party notes

- Exchange rates: <https://open.er-api.com> (ExchangeRate-API Open Access, no key). Terms require the attribution link shown in the footer and about one request per day. Rates are cached in `exchange_rates`; if the provider fails the last stored rates are used and a notice is shown.
