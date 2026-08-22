# Deploying Ploobia

The target is Cloudflare Pages: free, global, instant rollbacks, and — since
both halves are single files — nothing to get wrong at the asset level.

Everything below assumes the repository is on GitHub as `ploobia` and that
`ploobia.com` is already registered.

---

## 1. First deploy (about ten minutes)

**Push the repository.**

```bash
git init && git add -A && git commit -m "Ploobia: six cabinets, one bundle"
gh repo create ploobia --private --source=. --push
```

**Connect it to Pages.** In the Cloudflare dashboard → Workers & Pages →
Create → Pages → Connect to Git → pick `ploobia`, then:

| setting | value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm install && npm run install:all && npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave blank)* |
| Node version | `20` (set `NODE_VERSION=20` under environment variables) |

**Set the pilot variables** (Settings → Environment variables → Production):

```
VITE_PILOT           1
VITE_FEEDBACK_EMAIL  hello@ploobia.com
NODE_VERSION         20
```

Leave `VITE_FEEDBACK_URL` unset for now — reports will land on the clipboard
with a prefilled email, which is enough for a first round. Step 3 upgrades it.

Every push to `main` now redeploys. Preview deployments get their own URL per
branch, which is a good way to try a cabinet change before testers see it.

**Point the domain.** Custom domains → add `ploobia.com` and `www.ploobia.com`.
If the nameservers are already Cloudflare's this is one click; otherwise the
dashboard prints the CNAME to add at your registrar.

The arcade is then at **ploobia.com/app/**, and a specific cabinet is a direct
link — `ploobia.com/app/#/rivers` — which is what you want to paste to a tester
who should start in one place.

---

## 2. What testers get

An unlisted URL. `robots.txt` ships as `Disallow: /`, so it stays out of search
results, but anyone with the link can open it — there is no login, and the link
can be forwarded. That is the right trade for a first round; if it needs to
tighten later, Cloudflare Access can put an email allowlist in front of the
whole project without touching a line of code.

Worth saying in the invitation:

- **It's a browser thing.** No install. Chrome, Edge, Safari or Firefox, on a
  laptop or a tablet. It needs WebGL, which every current browser has.
- **First load is ~800 kB** and then it runs entirely offline until reloaded.
- **Progress lives on that device**, in that browser. There are no accounts, so
  a different tablet is a fresh start, and a private window forgets everything.
- **The "Tell us" tab on the left edge is the point.** Ask them to use it in the
  moment rather than remembering afterwards.

---

## 3. Collecting reports properly (optional, ~5 minutes)

Until an endpoint exists, a report is copied to the tester's clipboard with a
prefilled email. To have them arrive on their own:

```bash
npx wrangler kv namespace create REPORTS
```

Bind it: Pages project → Settings → Functions → KV namespace bindings → add
`REPORTS` → the namespace you just made. Then set the environment variable

```
VITE_FEEDBACK_URL   /api/feedback
```

and redeploy. `functions/api/feedback.js` starts accepting POSTs; without the
binding it returns 503 and the app quietly falls back to clipboard + mailto, so
a misconfiguration never silently swallows a report.

Read them back:

```bash
npx wrangler kv key list --binding REPORTS --preview false
npx wrangler kv key get "report:2026-08-22T…" --binding REPORTS --preview false
```

Each report carries the note, the cabinet, the band, the build id, the GPU, the
measured frame rate, the viewport, and anything that threw — the things that
turn "it was laggy" into something you can act on. Nothing is collected unless a
person writes a note and presses send.

---

## 4. Day-to-day

```bash
npm run build && npm run verify   # before pushing anything
git push                          # Pages deploys; Actions runs the suites
```

The GitHub Actions workflow (`.github/workflows/verify.yml`) builds the pilot
bundle and drives every cabinet in a real Chromium, keeping the screenshots as
artifacts for fourteen days. It does not gate the Pages deploy — Cloudflare has
already shipped by the time it finishes — so if it goes red, roll back in the
Pages dashboard (Deployments → the previous one → Rollback) and fix forward.

**Rolling out a fix mid-pilot.** Both HTML files are served `no-cache`, so a
tester reloading gets the new build immediately. Their progress survives: it is
keyed by `ploobia.events.v1` in that browser's storage and is not tied to a
build id.

---

## 5. Things that will bite

- **The whole app is one 2.5 MB file.** That is deliberate and it is fine at six
  cabinets, but it means every cabinet loads whether or not it is opened. The
  day that hurts, the fix is route-level code splitting, which means giving up
  `vite-plugin-singlefile` and serving real asset files — a change to make on
  purpose, not by accident.
- **No accounts means no cross-device progress.** A tester who starts on a
  laptop and continues on a tablet starts over. Fine for a pilot; the event log
  in `app/src/lib/events.ts` was written with a backend swap in mind — the
  schema does not change, only the adapter.
- **Private browsing loses everything on close.** The app detects this
  (`persist.available`) so it can be honest rather than pretending to save.
- **Build-time variables are baked in.** Changing `VITE_PILOT` or
  `VITE_FEEDBACK_URL` in the dashboard does nothing until a redeploy.
