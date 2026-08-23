# Putting Ploobia on ploobia.com (Namecheap shared hosting)

Fifteen minutes, no command line on the server, nothing to install. Everything
is static files plus two small PHP scripts.

---

## 1. Build the folder

On your machine, in the repo:

```bash
npm install && npm run install:all      # first time only
PLOOBIA_BUILD=teaser-1 npm run build:namecheap
```

That produces **`ploobia-public_html.zip`** — the whole site, ready to extract.
Inside it:

| file | what it is |
| --- | --- |
| `index.html` | the teaser page, with the live 3D Ploob |
| `app/index.html` | the arcade, all six cabinets |
| `og.png` | the social preview card |
| `.htaccess` | gzip, caching, https, `www` → apex |
| `api/feedback.php` | receives reports from the "Tell us" tab |
| `api/reports.php` | your private page for reading them |
| `robots.txt`, `sitemap.xml` | indexable — it's a public teaser |
| `404.html` | a not-found page in Ploobia's voice |

To keep it out of Google for now, build with `PLOOBIA_NOINDEX=1` instead.
To ship without the report tab, add `VITE_PILOT=0`.

---

## 2. Point the domain at the hosting

Namecheap dashboard → **Domain List** → `ploobia.com` → **Manage**.

- If the domain and the hosting are on the same Namecheap account, set
  **Nameservers** to *Namecheap BasicDNS* and the hosting package's nameservers
  will already be attached — check **Hosting List → Manage** for the exact
  `dnsX.namecheaphosting.com` pair and use those.
- DNS takes anywhere from ten minutes to a few hours. `nslookup ploobia.com`
  tells you when it has moved.

**Wait for the certificate before step 4.** Namecheap issues free AutoSSL once
the domain resolves — cPanel → **SSL/TLS Status**. If you upload the
`.htaccess` before the certificate exists, the https redirect sends visitors
into a security warning.

---

## 3. Upload

cPanel → **File Manager** → `public_html`.

1. Delete Namecheap's `default.html` / placeholder if one is there.
2. **Settings** (top right) → tick **Show Hidden Files (dotfiles)**. Without
   this you will not see `.htaccess` and will assume it did not upload.
3. **Upload** → `ploobia-public_html.zip`.
4. Back in `public_html`, right-click the zip → **Extract**.
5. Delete the zip.

You should now see `index.html`, `app/`, `api/`, `.htaccess` and the rest
directly in `public_html` — not inside a subfolder.

---

## 4. Check it

Open `https://ploobia.com`. Then:

- **Is it compressed?** This is the one that matters. The arcade is 2.5 MB raw
  and about 820 kB gzipped — three times the download if Apache is not
  compressing. Paste `https://ploobia.com/app/` into
  [gtmetrix.com](https://gtmetrix.com) or run:

  ```bash
  curl -sI -H 'Accept-Encoding: gzip' https://ploobia.com/app/ | grep -i content-encoding
  ```

  You want `content-encoding: gzip`. If nothing comes back, cPanel →
  **Optimize Website** → *Compress All Content* → Update.

- `https://ploobia.com/app/` opens the arcade.
- `https://ploobia.com/app/#/rivers` drops straight into one cabinet — handy
  for showing a single thing to someone.
- `https://ploobia.com/nothing-here` shows the Ploobia 404, not Apache's.
- `http://ploobia.com` and `https://www.ploobia.com` both land on the canonical
  address.

---

## 5. Turn on the feedback inbox

1. Open `api/reports.php` in File Manager → **Edit**.
2. Change `PLOOBIA_READ_KEY` to something long and private. Until you do, the
   page refuses to load rather than publishing your testers' words at a
   guessable address.
3. Visit `https://ploobia.com/api/reports.php?key=YOUR-KEY`.

The top line tells you whether the store is writable. Reports land in
`ploobia-data/reports.jsonl` **one level above `public_html`**, so no URL can
reach them. Nothing is recorded unless a person writes a note and presses send.

If it says NOT WRITABLE, create a folder named `ploobia-data` next to
`public_html` in File Manager and set its permissions to 700.

---

## 6. Making the social preview look right

The card is already wired (`og.png`, 1200×630). Two things worth knowing:

- WhatsApp, X, LinkedIn and Slack each **cache** a preview the first time a
  link is shared. If you share the URL before the site is live, they will keep
  showing nothing. Use each platform's debugger to refresh, or add `?v=2`.
- The card points at `https://ploobia.com/og.png` absolutely, which is correct
  for scrapers but means it only works once the domain is actually serving.

---

## Updating later

Rebuild, upload the zip, extract, overwrite. Both HTML files are served
`no-cache`, so a visitor who reloads gets the new version immediately — no
cache-busting, no waiting.

Keep the previous zip. Rolling back is extracting the old one.

---

## Things that will trip you up

- **`.htaccess` is invisible by default** in File Manager. Turn on dotfiles.
- **Extract in the right place.** Extracting into `public_html/ploobia/` puts
  the site at `ploobia.com/ploobia/`.
- **The https redirect before AutoSSL finishes** loops into a certificate
  warning. Certificate first, `.htaccess` second — or rename it to
  `htaccess.txt` until the padlock appears.
- **PHP version.** cPanel → *Select PHP Version* → 8.0 or newer. The scripts
  use typed syntax that 7.x will reject.
- **Namecheap's Starter plan allows one website.** If `ploobia.com` is an
  addon domain rather than the primary, its document root is
  `public_html/ploobia.com/` and everything above applies to *that* folder.
