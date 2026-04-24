# Ohio Citizen's Audit — Mobile Web App

A mobile-first single-page application giving Ohio citizens easy access to state legislative information, built on top of data from [ohiocitizensaudit.org](https://ohiocitizensaudit.org).

## Features

- **Home** — Live bills, election countdowns, leadership cards
- **Current Representatives** — All 33 constituent panels with member profiles
- **Member Participation** — 126 representatives ranked by bills sponsored/passed; Individual and Panel views
- **Committees** — House and Senate committees with live member and bill data
- **How Districts Work** — Visual explainers for redistricting concepts
- **How a Bill Becomes Law** — Flowchart and step-by-step guide
- **Member Profiles** — Full bio, committees, bills, and votes pulled live from OCA
- **Bill Detail** — Sponsors, status, and committee history
- **Committee Detail** — Members, roles, and bills

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Single-file HTML/CSS/Vanilla JS SPA |
| Hosting | Netlify |
| Serverless | Netlify Functions (Node.js) |
| Data | ohiocitizensaudit.org (live, no cache) |

## Project Structure

```
/
├── index.html                  # The entire SPA (one file)
├── netlify.toml                # Netlify build + redirect config
├── .gitignore
└── netlify/
    └── functions/
        ├── home.js             # Live bills + elections
        ├── leadership.js       # House/Senate leadership
        ├── representatives.js  # 33 constituent panels
        ├── participation.js    # Member participation data
        ├── committees.js       # Full committee list
        ├── committee_detail.js # Committee members + bills
        ├── member.js           # Individual member profiles
        ├── bill.js             # Bill detail + sponsors
        └── portrait.js         # Portrait proxy (bypasses OCA hotlink protection)
```

## Deploy to Netlify

### Option A — Netlify UI (easiest)

1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project**
3. Connect your GitHub account and select this repo
4. Build settings are auto-detected from `netlify.toml` — no changes needed
5. Click **Deploy site**

### Option B — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

## Local Development

```bash
npm install -g netlify-cli
netlify dev
```

Then open [http://localhost:8888](http://localhost:8888).

> The `netlify dev` command runs the serverless functions locally, so all live data features work during development.

## Data Sources

All data is fetched live from **ohiocitizensaudit.org** on every page load — no session caching for bills, leadership, or participation data. Member profiles and committee details are cached per session for performance.

Portrait images are proxied through `/.netlify/functions/portrait` to bypass OCA's hotlink protection.

## Notes

- The app detects `IS_NETLIFY` at runtime (`window.location.hostname !== 'localhost'` and not a file path) to decide whether to fetch live data or use embedded fallbacks
- All 48 committees (28 House + 20 Senate) use OCA committee IDs for deep-linking
- ZIP-to-district lookup uses a hardcoded 1,270-entry static table for reliability
