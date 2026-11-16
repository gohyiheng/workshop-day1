# Snip

Snip is a small URL shortener with one Bun API and two clients: an Angular web
app and a Node.js CLI. The `backend`, `frontend`, and `cli` branches are mounted
here as Git submodules; each folder points to a specific commit.

## API contract

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid input |
| `GET` | `/api/links` | — | `200` array of link records |
| `GET` | `/:code` | — | `302` to the original URL and increments hits; `404` if unknown |

Links are held in an in-memory map and are cleared when the backend restarts.

## Clone

Use `--recurse-submodules`; a plain clone leaves the component directories
unpopulated.

```sh
git clone --recurse-submodules https://github.com/gohyiheng/workshop-day1.git
```

If you already cloned without submodules, run:

```sh
git submodule update --init --recursive
```

## Run locally

Start each command from the `main` checkout in a separate terminal:

```sh
cd backend && bun run start
cd frontend && npm install && npx ng serve
cd cli && node cli.js ls
```

The backend listens on port `3000`; Angular serves the UI on port `4200`.

## Update a component

Commit and push changes from inside that component's branch checkout, then update
the pinned commit in this superproject:

```sh
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Repeat with `frontend` or `cli` as appropriate. The `bundle` branch is generated
release output; do not edit it by hand. Rebuild it with
`node scripts/build-bundle.mjs` after component updates.
