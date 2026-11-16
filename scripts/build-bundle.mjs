#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(root, "bundle");
const push = process.argv.slice(2).includes("--push");
const extraArgs = process.argv.slice(2).filter((arg) => arg !== "--push");

if (extraArgs.length > 0) {
  throw new Error(`Unknown argument: ${extraArgs[0]}`);
}

function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    shell: process.platform === "win32" && ["npm", "npx"].includes(command),
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = options.capture ? result.stderr.trim() : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}${
        detail ? `: ${detail}` : ""
      }`,
    );
  }

  return options.capture ? result.stdout.trim() : "";
}

function hasStagedChanges(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    stdio: "ignore",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (![0, 1].includes(result.status)) {
    throw new Error(`Unable to inspect staged changes in ${cwd}`);
  }
  return result.status === 1;
}

if (hasStagedChanges(root)) {
  throw new Error("Commit or unstage existing main changes before building the bundle.");
}

if (run("git", ["branch", "--show-current"], root, { capture: true }) !== "main") {
  throw new Error("Run the bundle builder from the main branch.");
}
for (const name of ["backend", "frontend", "cli", "bundle"]) {
  const cwd = path.join(root, name);
  if (
    fs.existsSync(path.join(cwd, ".git")) &&
    run("git", ["status", "--porcelain"], cwd, { capture: true })
  ) {
    throw new Error(`Commit or remove local changes in ${name} before rebuilding.`);
  }
}

run("git", ["submodule", "update", "--init", "--remote", "backend", "frontend", "cli"]);
run("git", ["submodule", "update", "--init", "bundle"]);

run("npm", ["install"], path.join(root, "frontend"));
if (
  run("git", ["status", "--porcelain", "--untracked-files=no"], path.join(root, "frontend"), {
    capture: true,
  })
) {
  throw new Error("npm install modified tracked frontend files; commit those changes first.");
}

run("npx", ["ng", "build"], path.join(root, "frontend"));

const frontendBuild = path.join(
  root,
  "frontend",
  "dist",
  "snip-frontend",
  "browser",
);
const indexFile = path.join(frontendBuild, "index.html");
if (!fs.existsSync(indexFile)) {
  throw new Error(`Angular build output is missing ${indexFile}`);
}

const publicDir = path.join(bundleDir, "public");
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.cpSync(frontendBuild, publicDir, { recursive: true });
fs.copyFileSync(path.join(root, "backend", "server.js"), path.join(bundleDir, "server.js"));
fs.copyFileSync(path.join(root, "cli", "cli.js"), path.join(bundleDir, "cli.js"));
fs.writeFileSync(path.join(bundleDir, ".env"), "PUBLIC_DIR=./public\n");
fs.writeFileSync(
  path.join(bundleDir, "package.json"),
  `${JSON.stringify({ name: "snip-bundle", version: "1.0.0", scripts: { start: "bun server.js" } }, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(bundleDir, "Dockerfile"),
  [
    "FROM oven/bun:1-alpine",
    "WORKDIR /app",
    "COPY . .",
    "ENV PORT=3000",
    "EXPOSE 3000",
    'CMD ["bun", "server.js"]',
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(bundleDir, ".dockerignore"),
  ["node_modules", ".git", "*.log", ""].join("\n"),
);
fs.writeFileSync(
  path.join(bundleDir, "railway.json"),
  `${JSON.stringify(
    {
      $schema: "https://railway.com/railway.schema.json",
      build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    },
    null,
    2,
  )}\n`,
);

if (hasStagedChanges(bundleDir)) {
  throw new Error("The bundle submodule already has staged changes; review them before rebuilding.");
}

run(
  "git",
  [
    "add",
    "--",
    ".dockerignore",
    ".env",
    "Dockerfile",
    "cli.js",
    "package.json",
    "public",
    "railway.json",
    "server.js",
  ],
  bundleDir,
);

if (hasStagedChanges(bundleDir)) {
  const userName = run("git", ["config", "user.name"], root, { capture: true });
  const userEmail = run("git", ["config", "user.email"], root, { capture: true });
  if (!userName || !userEmail) {
    throw new Error("Configure git user.name and user.email before committing the bundle.");
  }
  run(
    "git",
    [
      "-c",
      `user.name=${userName}`,
      "-c",
      `user.email=${userEmail}`,
      "commit",
      "-m",
      "Build generated release bundle",
      "-m",
      "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
      "-m",
      "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
    ],
    bundleDir,
  );
} else {
  console.log("Bundle unchanged.");
}

if (push) {
  run("git", ["push", "origin", "HEAD:bundle"], bundleDir);
}

run("git", ["add", "--", "backend", "frontend", "cli", "bundle"]);
if (hasStagedChanges(root)) {
  const userName = run("git", ["config", "user.name"], root, { capture: true });
  const userEmail = run("git", ["config", "user.email"], root, { capture: true });
  if (!userName || !userEmail) {
    throw new Error("Configure git user.name and user.email before committing submodule pointers.");
  }
  run(
    "git",
    [
      "-c",
      `user.name=${userName}`,
      "-c",
      `user.email=${userEmail}`,
      "commit",
      "-m",
      "Update generated bundle and source submodules",
      "-m",
      "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
      "-m",
      "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
    ],
  );
} else {
  console.log("Submodule pointers unchanged.");
}

if (push) {
  run("git", ["push", "origin", "HEAD:main"]);
}
