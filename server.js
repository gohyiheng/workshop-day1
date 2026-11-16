const { extname, relative, resolve, sep, isAbsolute } = require("node:path");
const { randomInt } = require("node:crypto");

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(process.env.PORT || 3000);
const configuredBaseUrl =
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`);
const baseUrl = new URL(configuredBaseUrl).origin;
const publicDir = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function respond(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...headers },
  });
}

function json(body, status = 200) {
  return respond(JSON.stringify(body), status, {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function createCode() {
  let code;
  do {
    code = Array.from(
      { length: 6 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
  } while (links.has(code));
  return code;
}

async function serveStatic(pathname) {
  if (!publicDir) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = resolve(publicDir, `.${requestedPath}`);
  const relativePath = relative(publicDir, filePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }

  const file = Bun.file(filePath);
  if (!(await file.exists()) || !(await file.stat()).isFile()) return null;

  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  const contentType = contentTypes[extname(filePath).toLowerCase()];
  return respond(file, 200, contentType ? { "Content-Type": contentType } : {});
}

async function handle(request) {
  if (request.method === "OPTIONS") {
    return respond(null, 204);
  }

  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "POST" && pathname === "/api/links") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }

    let originalUrl;
    try {
      originalUrl = new URL(body?.url);
    } catch {
      return json({ error: "url must be a valid HTTP(S) URL" }, 400);
    }

    if (originalUrl.protocol !== "http:" && originalUrl.protocol !== "https:") {
      return json({ error: "url must be a valid HTTP(S) URL" }, 400);
    }

    const code = createCode();
    const link = {
      code,
      url: originalUrl.href,
      shortUrl: `${baseUrl}/${code}`,
      hits: 0,
      createdAt: new Date().toISOString(),
    };
    links.set(code, link);
    return json(link, 201);
  }

  if (request.method === "GET" && pathname === "/api/links") {
    return json(Array.from(links.values()));
  }

  if (request.method === "GET") {
    const staticResponse = await serveStatic(pathname);
    if (staticResponse) return staticResponse;

    const code = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    if (code && !code.includes("/")) {
      const link = links.get(code);
      if (link) {
        link.hits += 1;
        return respond(null, 302, { Location: link.url });
      }
    }
  }

  return json({ error: "Not found" }, 404);
}

Bun.serve({ port, fetch: handle });
console.log(`Snip backend listening on ${baseUrl}`);
