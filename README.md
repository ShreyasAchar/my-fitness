# my-fitness

A personal Fitness Coach dashboard: weight trend, calories, protein, steps, sleep and training, read live from the **Fitness Coach Tracker** Google Sheet.

- `site/`: the static dashboard (HTML + d3), deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
- `apps-script/Code.gs`: a read-only Apps Script web app that serves the sheet's Daily Log, Profile and Workout Log tabs as JSON, **only** to requests carrying the secret key.

## Privacy

No fitness data lives in this repo. The page is public, but it shows nothing until it has the secret key, which is kept in your browser (`localStorage`) and in the Apps Script's Script Properties, never in code.

## Setup

1. In the Google Sheet: **Extensions → Apps Script**, paste `apps-script/Code.gs`.
2. **Project Settings → Script properties → Add**: `DASHBOARD_KEY` = your secret key.
3. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
4. Put that URL in `site/config.js` (`apiUrl`), commit and push.
5. Open `https://shreyasachar.github.io/my-fitness/#key=YOUR_KEY` once on each device. The key is remembered there and removed from the address bar.

To revoke access, change `DASHBOARD_KEY` in Script Properties.
