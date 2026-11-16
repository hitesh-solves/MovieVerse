# MovieVerse

**Discover movies. Watch trailers. Find free streams.**

MovieVerse is a movie discovery web app: browse popular and trending titles,
search the TMDB catalogue, watch trailers, check watch providers, and find
verified free-to-watch copies — all in one clean interface.

## Features

- **Browse & discover** — popular, trending and genre-based movie listings.
- **Search** — live TMDB search with debounced input and keyboard shortcuts.
- **Movie details** — posters, backdrops, ratings, overviews, release info.
- **Trailers** — embedded YouTube trailer playback on the detail view.
- **Watch providers** — region-aware availability (e.g. India) via TMDB.
- **Free movies** — verified free streaming links through the backend's
  `/api/movies/free` endpoints (human-verified identifiers only).
- **Pagination** — infinite-scroll style loading for listings and search.

## Tech stack

- **Frontend:** vanilla HTML/CSS/JavaScript — no framework, no build step.
- **Backend (deployed separately):** Java 17 + Spring Boot on Render,
  proxying the TMDB API so credentials stay server-side.
- **Data source:** [TMDB API](https://www.themoviedb.org/) (The Movie Database).
- **Deployment:** Netlify (frontend) + Render (backend).

## Project structure

```
MovieVerse/            # Static frontend (this repo's tracked root)
  index.html           # markup + embedded sample catalogue
  script.js            # rendering, search, TMDB/Render API calls
  style.css            # all styling
```

> Note: an earlier Spring Boot backend (`demo/demo`) exists in git history and
> is deployed on Render at `https://movieverse-b9cy.onrender.com`. The current
> repo tracks only the frontend; backend source is maintained separately.

## Setup

### Frontend

No build step — serve the folder with any static server:

```bash
python -m http.server 5500     # open http://localhost:5500
```

The frontend calls the deployed Render backend directly; no local backend or
environment variables are required for the frontend alone.

### Backend (Render)

The Spring Boot service expects a TMDB credential via environment/config:

| Variable | Purpose |
|---|---|
| `TMDB_API_KEY` or `TMDB_TOKEN` | TMDB API authentication (server-side only) |
| `dev.properties` | Optional local overrides — **never commit real values** |

Deploy with the included `Dockerfile`; set secrets in the Render dashboard,
not in code.

## API endpoints (backend, on Render)

- `GET /api/movies/popular?page=N`
- `GET /api/movies/search?query=...&page=N`
- `GET /api/movies/free` and `/api/movies/free/search?query=...`
- `GET /api/movies/{id}/watch-providers?region=IN`

## TMDB integration

The frontend never holds a TMDB key. All movie data flows through the Render
backend, which attaches the credential server-side. Poster/backdrop images
load directly from `https://image.tmdb.org` (public CDN, no key needed).

## Deployment

- **Frontend → Netlify:** connect the repo, publish directory = repo root.
- **Backend → Render:** Docker deploy of the Spring Boot service; configure
  `TMDB_*` env vars in the dashboard.

## Testing & verification

- Open the site, browse Popular, run a search, open a detail page, play a
  trailer, and check the free-movies section.
- Verify no API keys appear in browser DevTools → Network or page source.

## Status & limitations

- Working: discovery, search, details, trailers, providers, free-movie links.
- Free-stream links are curated/verified server-side; availability changes.
- Requires the Render backend to be running for live data.
