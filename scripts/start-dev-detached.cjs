const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const cwd = path.resolve(__dirname, "..");
const env = { ...process.env };
const pathValue = env.Path || env.PATH || "";

delete env.PATH;
env.Path = pathValue;

const out = fs.openSync(path.join(cwd, "dev-3000.out.log"), "w");
const err = fs.openSync(path.join(cwd, "dev-3000.err.log"), "w");
const node = "C:\\Progra~1\\nodejs\\node.exe";
const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");

const child = spawn(node, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
  cwd,
  detached: true,
  env,
  stdio: ["ignore", out, err],
  windowsHide: true
});

child.unref();
console.log(`Started SkyShare Job Builder dev server with PID ${child.pid}.`);
