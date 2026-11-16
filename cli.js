#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const os = require("node:os");

const API_BASE_URL = (process.env.SNIP_API || "http://localhost:3000").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 10000;

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  snip add <url>    Create a short link",
      "  snip ls           List links and hit counts",
      "  snip open <code>  Open the original URL in your browser",
      "  snip help          Show this help",
    ].join("\n") + "\n",
  );
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The API returned invalid JSON");
  }
}

function apiError(response, body) {
  return body && typeof body.error === "string"
    ? body.error
    : `API request failed (${response.status} ${response.statusText})`;
}

async function fetchApi(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    throw new Error(`Could not reach the Snip API at ${API_BASE_URL}: ${error.message}`);
  }

  if (options?.redirect === "manual" && response.status === 302) {
    return { response, body: null };
  }
  const body = await readJson(response);
  if (!response.ok) throw new Error(apiError(response, body));
  return { response, body };
}

function formatLinks(links) {
  if (links.length === 0) return "No links yet.";

  const rows = links.map((link) => [
    String(link.code ?? ""),
    String(link.hits ?? 0),
    String(link.url ?? ""),
  ]);
  const codeWidth = Math.max(4, ...rows.map(([code]) => code.length));
  const hitsWidth = Math.max(4, ...rows.map(([, hits]) => hits.length));
  return [
    `${"CODE".padEnd(codeWidth)}  ${"HITS".padStart(hitsWidth)}  URL`,
    ...rows.map(([code, hits, url]) =>
      `${code.padEnd(codeWidth)}  ${hits.padStart(hitsWidth)}  ${url}`,
    ),
  ].join("\n");
}

function launchBrowser(url) {
  let command;
  let args;
  switch (os.platform()) {
    case "win32":
      command = "cmd.exe";
      args = ["/d", "/s", "/c", "start", '""', url];
      break;
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "linux":
      command = "xdg-open";
      args = [url];
      break;
    default:
      throw new Error(`Opening links is not supported on ${os.platform()}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  try {
    if (command === "add") {
      if (args.length !== 1 || !isHttpUrl(args[0])) {
        throw new Error("Usage: snip add <http-or-https-url>");
      }
      const { body } = await fetchApi("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: args[0] }),
      });
      if (!body || typeof body.shortUrl !== "string") {
        throw new Error("The API response is missing shortUrl");
      }
      process.stdout.write(`${body.shortUrl}\n`);
      return 0;
    }

    if (command === "ls") {
      if (args.length !== 0) throw new Error("Usage: snip ls");
      const { body } = await fetchApi("/api/links");
      if (!Array.isArray(body)) throw new Error("The API response must be a list of links");
      process.stdout.write(`${formatLinks(body)}\n`);
      return 0;
    }

    if (command === "open") {
      if (args.length !== 1 || !/^[A-Za-z0-9]{6}$/.test(args[0])) {
        throw new Error("Usage: snip open <6-character-code>");
      }
      const { response } = await fetchApi(`/${encodeURIComponent(args[0])}`, {
        redirect: "manual",
      });
      if (response.status !== 302) {
        throw new Error(`Expected a redirect, received ${response.status}`);
      }

      const location = response.headers.get("location");
      if (!location) throw new Error("The API redirect did not include a Location header");
      const target = new URL(location, `${API_BASE_URL}/`);
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        throw new Error("The API redirect target must use HTTP or HTTPS");
      }
      await launchBrowser(target.href);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { formatLinks, isHttpUrl, launchBrowser, main };
