# WikiSpeedruns

Race from one Wikipedia article to another using only the links inside them — then see how your route compares with **every shortest path**, via a built-in [Six Degrees of Wikipedia](https://github.com/jwngr/sdow).

**Live:** https://wiki-speedruns.web.app

## Features

- **Daily Challenge** — same pair for everyone (resets 00:00 UTC), first attempt is ranked, global leaderboard (fastest / fewest clicks), streaks.
- **Random**, **Chaos** (truly random articles) and **Custom** challenges, with shareable challenge links.
- **Fair timer** — pauses while pages load. Back is allowed but costs a click.
- **Post-run analysis** — for every page you visited: how many clicks you still were from the target, which link was best, your first wrong turn, a distance chart, and a graph of all shortest paths with your route highlighted. Wordle-style share card.
- **Hints** (unranked runs) — Six Degrees tells you how far you are and highlights the best link on the page.
- **Six Degrees explorer** — any two articles, two engines:
  - *Database*: the Six Degrees of Wikipedia API (full link-graph snapshot, milliseconds).
  - *Live*: a port of SDOW's bi-directional BFS (`sdow/breadth_first_search.py`) running in your browser against the live Wikipedia API. Auto mode falls back to it for articles newer than the snapshot.
- **Login** (Firebase Auth): Google, email/password, or guest (upgradeable without losing history). Runs sync across devices; everything also works logged-out (saved locally).
- **Runs everywhere**: website, installable app on phones/desktop (PWA, works offline for the shell), and a **single self-contained HTML file** (`public/WikiSpeedruns.html`).
- Light/dark themes, keyboard shortcuts (<kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>Backspace</kbd> = back).

## Why the SDOW *API* and not its data files

SDOW's data is a ~10 GB SQLite database built from Wikipedia dumps — impossible to ship to a browser. So the app uses SDOW's public API for the full-graph search, and re-implements SDOW's algorithm in `public/js/sdow.js` for the live engine (verified against brute-force BFS in `tests/bfs.test.js`).

## Project layout

```
public/                 static site (Firebase Hosting root) — no build step
  index.html
  js/util.js            helpers
  js/wiki.js            Wikipedia API client (articles, search, link graph queries)
  js/sdow.js            Six Degrees: API client + bi-directional BFS port
  js/game.js            lobby, the run, results/analysis
  js/views.js           home, explorer, history, leaderboard, account, about
  js/auth.js            Firebase Auth + Firestore (lazy-loaded)
  js/firebase-config.js optional config for non-Firebase hosts
  sw.js, manifest.webmanifest, icons/
  WikiSpeedruns.html    generated single-file build
scripts/                single-file builder, icon renderer
firestore.rules         security rules (daily entries are create-only)
tests/                  node --test
```

## Run locally

```bash
npm start          # http://localhost:8080  (login is disabled locally unless you fill in js/firebase-config.js)
npm test
npm run build      # regenerates public/WikiSpeedruns.html
```

## Deploy to wiki-speedruns.web.app (one-time setup)

1. In the [Firebase console](https://console.firebase.google.com), create a project with ID **`wiki-speedruns`** (if that ID is taken, use another and change `.firebaserc`, `firebase.json` → `hosting.site`, and the workflow).
2. **Build → Authentication → Sign-in method**: enable **Google**, **Email/Password** and **Anonymous**.
3. **Build → Firestore Database**: create a database (production mode).
4. **Project settings → Your apps**: add a **Web app** (no config needs copying — Hosting serves it at `/__/firebase/init.json`).
5. Deploy from your machine:
   ```bash
   npm i -g firebase-tools
   firebase login
   npm run deploy        # builds the single-file HTML, deploys hosting + Firestore rules/indexes
   ```
6. *(Optional, for auto-deploy on every push to `main` + preview URLs on PRs)*: run `firebase init hosting:github`, or create a service account key with the *Firebase Hosting Admin* + *Firebase Rules Admin* + *Cloud Datastore Index Admin* roles and save it as the repo secret `FIREBASE_SERVICE_ACCOUNT`.

## Credits

Article content © Wikipedia contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Shortest paths from [Six Degrees of Wikipedia](https://www.sixdegreesofwikipedia.com) by Jacob Wenger (MIT). Inspired by [wikispeedruns.com](https://wikispeedruns.com).
