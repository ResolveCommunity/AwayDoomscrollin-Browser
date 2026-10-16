# AwayDoomscrollin' Browser Extension

> Open-source, privacy-first browser extension to pause infinite scrolling on Instagram Reels, TikTok, and YouTube Shorts.

## Supported Browsers
- Google Chrome & Chromium-based browsers (Brave, Edge, Opera, Vivaldi) - Manifest V3
- Mozilla Firefox - Manifest V3

## Features
- **Two protection modes:** Strict Mode closes recommendation loops; Balanced Mode allows one deliberately selected short video in Focused Viewing.
- **Intent-aware YouTube protection:** Uses YouTube's canonical video metadata instead of duration, so a useful sub-60-second normal video is not blocked merely for being short.
- **Whitelist Intentional Spaces:** Preserves direct messaging (DMs), search, subscriptions, channels, libraries, and long-form videos.
- **100% Local:** No telemetry, no data collection, no background tracking.

## Building from source
Run build script with Node.js:
```bash
node scripts/build.mjs
node scripts/package-zip.mjs
```
The output zip files will be placed in dist/.
