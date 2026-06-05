# Trackr Autofill — browser extension

A Manifest V3 extension that fills UK finance internship application forms from
your Trackr profile and drafts answers to free-text questions **on the ATS page**
(Greenhouse, Lever, Ashby; Workday best-effort). You always review and submit —
**the extension never submits an application for you**, never solves captchas, and
never scrapes employer data. It only does what you could do by hand.

## How it works

- The **service worker** (`src/background.ts`) is the only place that holds your
  API token and talks to the Trackr API (`/api/ext/*`). Content scripts message it.
- A **content script** (`src/content/index.ts`) detects the application form,
  mounts a floating panel (Shadow DOM, so page CSS can't interfere), autofills
  recognized fields, and offers an AI **Draft** for each open-ended question.
- A second content script (`src/content/connect.ts`) runs on Trackr pages and
  captures the connection token when you generate it in Settings.

## Develop / load

```bash
npm install
npm run build        # outputs dist/
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the `extension/dist` folder. (`npm run dev` runs Vite with
HMR for iterative work.)

## Connect to your account

1. Open Trackr → **Settings → Browser extension → Generate connection token**.
   If the extension is installed, it connects automatically. Otherwise copy the
   token, open the extension popup, choose your Trackr URL, and paste it.
2. Visit a Greenhouse / Lever / Ashby application page → the Trackr panel appears
   → **Autofill**, then **Draft** answers, edit, **Insert**, and submit yourself.

## Notes

- File-upload fields (CV attachment) can't be set programmatically by any
  extension for security reasons — attach your CV manually. Your CV text still
  grounds the generated answers server-side.
- Icons are intentionally omitted for the dev build; add `icons` to
  `manifest.json` before publishing to the Chrome Web Store.
