const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function client(response) {
  const launches = [];
  const errors = [];
  let requestOptions;
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === "node:child_process") {
        return {
          spawn(command, args) {
            launches.push({ command, args });
            const child = new EventEmitter();
            child.unref = () => {};
            queueMicrotask(() => child.emit("spawn"));
            return child;
          },
        };
      }
      if (name === "node:os") return { platform: () => "linux" };
      throw new Error(`Unexpected dependency ${name}`);
    },
    process: {
      env: {}, argv: [], stdout: { write() {} },
      stderr: { write: (text) => errors.push(text) },
    },
    URL, AbortSignal,
    fetch: async (_url, options) => { requestOptions = options; return response; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "cli.js"), "utf8"), context);
  return { main: context.module.exports.main, launches, errors, options: () => requestOptions };
}

test("open accepts a manual 302 and opens Location without parsing its HTML body", async () => {
  const app = client(new Response("<html>redirect</html>", {
    status: 302, headers: { location: "https://example.com/target" },
  }));
  assert.equal(await app.main(["open", "abc123"]), 0);
  assert.equal(app.options().redirect, "manual");
  assert.equal(app.launches.length, 1);
  assert.equal(app.launches[0].args[0], "https://example.com/target");
});

test("open rejects a redirect without Location", async () => {
  const app = client(new Response(null, { status: 302 }));
  assert.equal(await app.main(["open", "abc123"]), 1);
  assert.match(app.errors.join(""), /Location/);
  assert.equal(app.launches.length, 0);
});

test("open rejects an unknown short code without launching a browser", async () => {
  const app = client(Response.json({ error: "Not found" }, { status: 404 }));
  assert.equal(await app.main(["open", "abc123"]), 1);
  assert.match(app.errors.join(""), /Not found/);
  assert.equal(app.launches.length, 0);
});
