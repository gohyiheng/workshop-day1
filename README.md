# Snip frontend

The Angular 22 web client for Snip. It shortens HTTP(S) URLs and lists links
from the shared backend API.

## Run locally

Use Node.js `^22.22.3`, `^24.15.0`, or `>=26.0.0` with npm. The toolchain uses
TypeScript 6.0. Angular's migration preserves eager change detection and the
XHR HTTP transport explicitly; the API contract and UI behavior are unchanged.

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

## Verify

```sh
npm audit --omit=dev --audit-level=high
npm audit
npx ng test --watch=false --browsers=ChromeHeadless
```

The component tests require Chrome or a Chromium browser configured through
`CHROME_BIN`.
