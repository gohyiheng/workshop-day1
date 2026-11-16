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
git clone --branch main --recurse-submodules https://github.com/gohyiheng/workshop-day1.git
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

## Release and verification

The builder updates the source submodules to their branch tips, builds Angular,
and copies the exact backend and CLI into `bundle`. It refuses dirty submodules,
guards empty commits, and commits the generated release plus its pointers locally.
Run it again to verify an unchanged release creates no commits. Add `--push` to
publish `bundle` and then `main`. Configure your Git author before running it.

```sh
node scripts/build-bundle.mjs
node scripts/smoke-test.mjs
node scripts/build-bundle.mjs --push
```

The smoke check starts a temporary Bun server on a free port, verifies the built
UI assets, API creation/listing/redirects and hit counts, and CLI add/list, then
stops its server. Set `BUN_BIN` to a Bun executable path if needed on Windows.
CLI redirect regression tests run with `node --test cli/cli.test.js`; they mock
browser launching rather than opening a desktop browser.

The hourly/manual **Build bundle** workflow runs on `main`. It validates the
assembled release before pushing. Its token needs `contents: write` for branch
updates and `actions: write` to dispatch image verification, because pushes made
with `GITHUB_TOKEN` do not start another push workflow.

**Build and push image** watches the `bundle` gitlink on `main` and its own workflow
file, and also supports manual dispatch. It audits production dependencies,
compares source files and rebuilt UI against the pinned bundle, builds and scans
the image, and smoke-tests the container before publishing that same image to
`ghcr.io/gohyiheng/workshop-day1:latest` and `:sha-<short-main-sha>`.
High/critical audit or image findings block publication. GHCR packages may be
private initially; this pipeline does not change package visibility.

```sh
cd bundle
docker build -t snip .
docker run --rm -p 3000:3000 snip
```

Docker must be installed to perform the container checks locally. The bundle
also includes `railway.json` for Dockerfile-based deployment; deployment and
account configuration are separate from generating the release.
