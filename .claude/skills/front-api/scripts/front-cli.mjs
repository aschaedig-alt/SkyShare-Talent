#!/usr/bin/env node
// Front API — read-only helper for setup & debugging.
//
// Intentionally has NO send/write commands: this is for proving the token works,
// finding channel ids, and inspecting conversations without any risk of emailing a
// real person. Sending belongs in reviewed app code, not an ad-hoc script.
//
// Usage:
//   FRONT_API_TOKEN=xxxx node front-cli.mjs channels
//   FRONT_API_TOKEN=xxxx node front-cli.mjs channel <channel_id>
//   FRONT_API_TOKEN=xxxx node front-cli.mjs inboxes
//   FRONT_API_TOKEN=xxxx node front-cli.mjs conversation <conversation_id>
//   FRONT_API_TOKEN=xxxx node front-cli.mjs messages <conversation_id>
//   FRONT_API_TOKEN=xxxx node front-cli.mjs tags
//   FRONT_API_TOKEN=xxxx node front-cli.mjs ratelimit   # show rate-limit headers only

import { readFileSync } from "node:fs";

const BASE = "https://api2.frontapp.com";

// Prefer an already-set env var; otherwise read FRONT_API_TOKEN from a gitignored
// .env.local / .env in the current directory, so the secret never has to be typed on
// the command line or pasted into a chat.
function loadToken() {
  if (process.env.FRONT_API_TOKEN) return process.env.FRONT_API_TOKEN;
  for (const file of [".env.local", ".env"]) {
    try {
      const line = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .find((l) => /^\s*FRONT_API_TOKEN\s*=/.test(l));
      if (line) {
        return line
          .replace(/^\s*FRONT_API_TOKEN\s*=\s*/, "")
          .replace(/^["']|["']$/g, "")
          .trim();
      }
    } catch {
      /* file not present */
    }
  }
  return null;
}

const token = loadToken();

if (!token) {
  console.error(
    "No FRONT_API_TOKEN found. Add it to .env.local (FRONT_API_TOKEN=...) or set it in the environment."
  );
  process.exit(1);
}

async function get(path) {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    headers: { Authorization: "Bearer " + token },
  });
  const rl = {
    limit: res.headers.get("x-ratelimit-limit"),
    remaining: res.headers.get("x-ratelimit-remaining"),
    reset: res.headers.get("x-ratelimit-reset"),
  };
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, ok: res.ok, rl, body };
}

function show(res) {
  console.error(
    `HTTP ${res.status}  ratelimit ${res.rl.remaining ?? "?"}/${res.rl.limit ?? "?"} remaining`,
  );
  if (!res.ok) {
    console.error("Error:", JSON.stringify(res.body?._error ?? res.body, null, 2));
    process.exit(1);
  }
}

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  case "channels": {
    const res = await get("/channels");
    show(res);
    for (const c of res.body._results ?? []) {
      console.log(`${c.id}\t${c.type ?? "?"}\t${c.address ?? c.name ?? ""}`);
    }
    console.log("\nUse the id column as {channel_id} when sending.");
    break;
  }
  case "channel": {
    if (!arg) fail("channel <channel_id>");
    const res = await get(`/channels/${arg}`);
    show(res);
    console.log(JSON.stringify(res.body, null, 2));
    break;
  }
  case "inboxes": {
    const res = await get("/inboxes");
    show(res);
    for (const i of res.body._results ?? []) {
      console.log(`${i.id}\t${i.name ?? ""}`);
    }
    break;
  }
  case "conversation": {
    if (!arg) fail("conversation <conversation_id>");
    const res = await get(`/conversations/${arg}`);
    show(res);
    console.log(JSON.stringify(res.body, null, 2));
    break;
  }
  case "messages": {
    if (!arg) fail("messages <conversation_id>");
    const res = await get(`/conversations/${arg}/messages`);
    show(res);
    for (const m of res.body._results ?? []) {
      const who = m.author?.email ?? m.recipients?.map((r) => r.handle).join(",") ?? "?";
      console.log(`--- ${m.id}  (${m.is_inbound ? "inbound" : "outbound"})  ${who}`);
      console.log((m.text ?? m.body ?? "").slice(0, 500));
    }
    break;
  }
  case "templates": {
    // Front-side saved message templates. Useful when an email "lives in Front"
    // rather than in the app, e.g. the onboarding-journey email.
    const res = await get("/message_templates");
    show(res);
    for (const t of res.body._results ?? []) {
      console.log(`${t.id}\t${t.name ?? ""}\t[${t.subject ?? ""}]`);
    }
    break;
  }
  case "template": {
    if (!arg) fail("template <template_id>");
    const res = await get(`/message_templates/${arg}`);
    show(res);
    console.log(JSON.stringify(res.body, null, 2));
    break;
  }
  case "tags": {
    const res = await get("/tags");
    show(res);
    for (const t of res.body._results ?? []) {
      console.log(`${t.id}\t${t.name ?? ""}`);
    }
    break;
  }
  case "ratelimit": {
    const res = await get("/channels");
    show(res);
    console.log(JSON.stringify(res.rl, null, 2));
    break;
  }
  default:
    console.error(
      "Commands: channels | channel <id> | inboxes | conversation <id> | messages <id> | templates | template <id> | tags | ratelimit",
    );
    process.exit(1);
}

function fail(usage) {
  console.error("Usage: node front-cli.mjs " + usage);
  process.exit(1);
}
