# Snip backend

A zero-dependency Bun API for creating and resolving short links. Links are
stored in memory and are cleared when the server restarts.

## Run

```sh
bun run start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in generated short URLs, or `RAILWAY_PUBLIC_DOMAIN` to
use `https://<domain>` when `BASE_URL` is unset. `BASE_URL` takes precedence.

Set `PUBLIC_DIR` to also serve static files from that directory. `/` serves
`index.html`, and an existing static file takes precedence over a short code.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link and
  returns `201` with its code, original URL, short URL, hit count, and timestamp.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count, or
  returns `404` when the code does not exist.
