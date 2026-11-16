import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.resolve(root, process.argv[2] || "bundle");
const suppliedOrigin = process.env.SMOKE_ORIGIN;
let server;
let output = "";

function cli(args) {
  const result = spawnSync(process.execPath, [path.join(directory, "cli.js"), ...args], {
    env: { ...process.env, SNIP_API: origin },
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

let origin = suppliedOrigin;
try {
  if (!origin) {
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve, reject) => {
      reservation.close((error) => (error ? reject(error) : resolve()));
    });
    origin = `http://127.0.0.1:${port}`;
    server = spawn(process.env.BUN_BIN || "bun", ["server.js"], {
      cwd: directory,
      env: {
        ...process.env,
        PORT: String(port),
        BASE_URL: origin,
        PUBLIC_DIR: "./public",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.on("error", (error) => { output += error.message; });
    server.stdout.on("data", (chunk) => { output += chunk; });
    server.stderr.on("data", (chunk) => { output += chunk; });
  }

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server && (server.exitCode !== null || server.signalCode !== null)) {
      throw new Error(`Server exited before readiness: ${output}`);
    }
    try {
      const response = await fetch(`${origin}/api/links`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { ready = true; break; }
    } catch (error) {
      if (attempt === 99) throw new Error(`Server never became ready: ${output}`, { cause: error });
    }
    await delay(100);
  }
  assert(ready, `Server failed its readiness check: ${output}`);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<app-root/);
  const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert(scriptPaths.length > 0, "Built UI must load its JavaScript");
  for (const scriptPath of scriptPaths) {
    const response = await fetch(new URL(scriptPath, `${origin}/`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /javascript/);
  }
  const invalid = await fetch(`${origin}/api/links`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{",
  });
  assert.equal(invalid.status, 400);
  const created = await fetch(`${origin}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/snip-smoke" }),
  });
  assert.equal(created.status, 201);
  const link = await created.json();
  assert.deepEqual(Object.keys(link).sort(), ["code", "url", "shortUrl", "hits", "createdAt"].sort());
  assert.match(link.code, /^[A-Za-z0-9]{6}$/);
  assert.equal(link.hits, 0);
  const redirect = await fetch(`${origin}/${link.code}`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), link.url);
  const links = await (await fetch(`${origin}/api/links`)).json();
  assert.equal(links.find((item) => item.code === link.code).hits, 1);
  assert.match(cli(["ls"]), new RegExp(link.code));
  assert.match(cli(["add", "https://example.com/from-cli"]), /^https?:\/\//);
  console.log("Smoke checks passed: UI assets, API errors/create/list/redirect/hits, CLI add/list.");
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
}
