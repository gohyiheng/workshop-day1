# Snip frontend

The Angular 19 web client for Snip. It shortens HTTP(S) URLs and lists links
from the shared backend API.

## Run locally

Start the backend on port `3000`, then run:

```sh
npm install
npx ng serve
```

The Angular development server proxies `/api` requests to
`http://localhost:3000`. In a bundled deployment, the same relative API path
uses the host serving both the frontend and backend.

## Build

```sh
npx ng build
```

The production browser app is emitted to `dist/snip-frontend/browser`.
