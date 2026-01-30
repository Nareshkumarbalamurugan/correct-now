# CorrectNow Chrome Extension (MVP)

This is a Manifest V3 Chrome extension that can run CorrectNow proofreading on *any* website's text fields.

## What it does (v0.1.0)
- Detects focused `input[type=text|search|url|tel]`, `textarea`, and `contenteditable` fields
- Shows a small floating "CorrectNow: Check" button near the field
- Calls your existing backend `POST /api/proofread`
- Displays suggestions and can apply them into the field

## Build
From the repo root:

```powershell
cd chrome-extension
npm install
npm run build
```

Build output is in `chrome-extension/dist/`.

## Load into Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `chrome-extension/dist`

## Configure
Click the extension icon → set:
- **API Base URL**: `https://correctnow.app` (prod) or `http://localhost:8787` (dev)
- Language: Auto/Tamil/etc
- Auto-check: optional (debounced)

## Notes / Next upgrades
- Underlines like Grammarly require per-site overlay rendering; this MVP focuses on reliable apply/replace.
- Avoids password/email fields by design.
- Auth/credits UI can be added in the popup (Firebase sign-in flow).
