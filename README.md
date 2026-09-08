# Catan Map Generator

Random board generator for Settlers of Catan.

## Start

```bash
python3 -m http.server 8001
```

Open: http://localhost:8001

## Features

- Classic and Custom modes
- Red numbers (6 & 8) never adjacent
- Seed system for reproducible boards
- Mobile responsive
- PWA: Install as mobile app

## Mobile App

iOS: Open in Safari → Share → Add to Home Screen
Android: Open in Chrome → Menu → Add to home screen

## Deploy

GitHub Pages (Settings > Pages > Source: main). Always deploy through the
script — it stamps a fresh build id into the service worker cache name and
the `?v=` asset params, so PWA users get the new version on their next load
instead of a stale cached copy.

```bash
git commit -am "feat: ..."   # your changes first
./deploy.sh                  # stamp + commit + push
```

Caching: HTML/JS/CSS are network-first (cache only used offline); images
are cache-first. A new service worker reloads open tabs once automatically.

---

MIT License



