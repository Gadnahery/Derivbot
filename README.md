# Strategy Bot (Vercel + Supabase)

Dominance + Sweep + Body-Close strategy, cron-scanned on Vercel, state in Supabase.

## Setup

1. Create tables in Supabase SQL editor (see `supabase-schema.sql`).
2. Set env vars on Vercel:
   - `DERIV_TOKEN` — fresh demo PAT
   - `DERIV_APP_ID` — your app id from api.deriv.com
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (or service role key for inserts with RLS off)
   - `CRON_SECRET` (optional but recommended)

3. Deploy. Cron hits `/api/scan` every minute. Dashboard at `/`.

## Notes

- Vercel runs one scan cycle per minute (not a persistent WebSocket).
- Min stake 0.35, one trade at a time.
- Strategy logic is unchanged from the original bot.
