# L2L Coaching Portal

A coaching dashboard for **L2L Consulting Team** (l2lconsultingteam.com) with three portals in one app — **client**, **coach**
and **admin** — built on the same stack as the Awana Parent Dashboard (React 19 + Vite + Tailwind) with a Cloudflare Pages
Functions API storing data in **R2**.

It runs in two modes, picked automatically:

| | Demo mode | Live mode |
|---|---|---|
| When | no API present (`npm run dev`, static hosting) | the `/api` functions are deployed |
| Data | fictional, in the browser's localStorage | your R2 bucket |
| Sign-in | demo buttons | invite code + your own passcode |
| Access rules | UI only | **enforced on the server** |

```bash
npm install
npm run dev          # demo mode on http://localhost:5173
npm test             # 64 tests: hours, slots, reminders, contracts, auth, access rules, email
npm run build
```

## Deploying with Cloudflare R2

You said you'll create the bucket — here's everything else.

1. **Create the bucket** (dashboard → R2 → Create bucket, or `npx wrangler r2 bucket create l2l-coaching`).
   If you name it something other than `l2l-coaching`, change `bucket_name` in [`wrangler.toml`](wrangler.toml). Keep it **private** (no public access / custom domain on the bucket).
2. **Create the Pages project** and deploy: `npm run build && npx wrangler pages deploy dist --project-name l2l-dashboard`
   (or connect the repo: build command `npm run build`, output `dist`). The R2 binding `L2L_BUCKET` comes from `wrangler.toml`.
3. **Set secrets** (never commit these):
   ```bash
   openssl rand -base64 32 | npx wrangler pages secret put SESSION_SECRET --project-name l2l-dashboard
   npx wrangler pages secret put BOOTSTRAP_KEY --project-name l2l-dashboard     # any one-time phrase you'll type once
   npx wrangler pages secret put CRON_SECRET   --project-name l2l-dashboard     # random string, shared with the cron worker
   npx wrangler pages secret put RESEND_API_KEY --project-name l2l-dashboard    # only if you want server-sent email
   ```
   and fill in `APP_URL` (your portal's public URL) and `MAIL_FROM` (a Resend-verified sender) in `wrangler.toml`, then redeploy.
4. **Create the first admin:** open the site — it shows *First-time setup*. Enter the `BOOTSTRAP_KEY`, your name, email and a passcode.
   That form disappears for good once an admin exists; you can delete `BOOTSTRAP_KEY` afterward.
5. **Add people:** *Clients & Orgs* → add organizations and clients; *L2L Team* → add coaches/admins. Press **Invite** on a person to
   get a one-time code and link (or **Create & email it** if email is set up). They choose their own passcode; you never see it.
   A coach leaving? *L2L Team → Remove…* hands their clients to someone else.
6. **Email (optional):** verify your sending domain in Resend, set `RESEND_API_KEY` + `MAIL_FROM`. The *Reminders & Email* page then shows
   **Send** buttons. For hands-off reminders, deploy [`cron-worker/`](cron-worker) (hourly; set its `PORTAL_URL` and the same `CRON_SECRET`) and
   turn on *Send due reminders automatically* in Settings. Until then everything still works — emails just wait in the outbox for a person to send.
7. **Recommended:** add a Cloudflare WAF *rate-limiting rule* on `/api/auth/*` (the server also locks an account for 15 minutes after 5 bad
   passcodes), use a custom domain, and put the Pages project behind Cloudflare Access too if you want a second gate for staff.

Local live-mode testing (simulated R2, no account needed): copy `.dev.vars.example` to `.dev.vars`, then
`npm run build && npm run dev:api` and open http://localhost:8788. For hot-reload UI work run `npm run dev` alongside it — Vite proxies `/api` to it.

## Who sees what

Enforced by the server in live mode (`server/scope.ts` decides what is *sent*; `server/rules.ts` decides what may be *changed*).

| | Client | Coach | Admin |
|---|---|---|---|
| Sees | only their own program(s) | all clients' names/contact details, but program records only for **their** clients | everything |
| Private coach notes | never sent to the browser | own clients | all |
| Team engagements | own check-ins & steps only; shared message thread | – | – |
| Agreement | read, and e-sign (primary contact, exact name; time stamped by the server) | draft / edit / send | all |
| Sessions | request, reschedule, cancel, rate (only into real open slots) | confirm, log hours, override | all coaches |
| Settings, people, resources, passcode invites | – | own availability only | ✓ |

Sign-in uses PBKDF2-hashed passcodes, 7-day signed `HttpOnly` cookies, a CSRF header on every write, per-account and per-IP lockout,
and the same error for unknown email vs wrong passcode. Changing a passcode (or someone's role) signs out their other sessions.

## How the pieces work

- **Pre-program**: creating an engagement scaffolds a checklist and a draft agreement. When the agreement is signed, every step is done and the start date arrives, the server moves it to *Active*.
- **Hours**: only sessions the coach *logs* count as delivered; booked time is shown separately; a no-show counts only if hours are entered.
- **Scheduling**: coaches set weekly availability; clients can only book real open slots (checked again on the server, across all of that coach's engagements). Bookings are *requests* until confirmed (configurable). `.ics` / Google Calendar per session.
- **Reminders** are derived from live data, so they clear themselves. *Scan* queues the due ones as emails once each; the weekly digest goes out on the weekday you choose in Settings.
- **Business timezone** (Settings): every session time means that zone, whatever device or server is looking at it.

## Honest limits

- **Not verified against Cloudflare itself.** I ran the full stack on the real Workers runtime (`wrangler pages dev`) with a *simulated* R2, and
  the server logic against an in-memory R2 with the same conditional-write behaviour. I have not deployed to your account or used a live R2 bucket.
- **Resend delivery is untested against the real service** (tests stub the HTTP call). Check one real email after you configure it.
- **R2 is object storage, not a database.** Each engagement is one JSON file, so two people editing *different* records at once both succeed,
  but a heavy multi-user workload or hundreds of engagements would be better on D1. Fine for a coaching practice's scale; it re-reads all
  engagements on each poll (every 30s while a tab is open and visible).
- **R2 has no point-in-time restore.** Use *Settings → Download full backup* on a schedule.
- **Passcode reset is admin-mediated** (a new invite) — there's no self-service "forgot passcode" email flow yet.
- **Contract terms are starter text, not legal advice.** Have counsel review them (*Settings*); a typed-name e-signature may not meet your needs.
- The L2L site publishes no pricing, packages or durations, so fees/hours in the demo data are placeholders.
