// Sign in to Notion's hosted MCP server once and save the token for collect-notion.ts.
//
//   node notion-login.ts [--out TOKEN_FILE]   (defaults to NOTION_TOKEN_FILE from the environment or .env.local)
//
// Opens the browser for Notion's consent page (OAuth with PKCE, a one-time code check that needs no
// client secret), catches the redirect on a local port, and writes the tokens to TOKEN_FILE with mode 600.
// The token acts as you: it sees every page and comment you can see. Keep the file out of repos.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { fatal, fetchJson, isMain, log } from "./common.ts";
import { notionToken, type NotionToken } from "./records.ts";
import { number, object, parse, string, withDefault } from "./schema.ts";

export const NOTION_MCP = "https://mcp.notion.com";
const registration = object({ client_id: string });
const tokenResponse = object({ access_token: string, refresh_token: withDefault(string, () => ""), expires_in: withDefault(number, () => 3600) });

const b64url = (b: Buffer) => b.toString("base64url");

/** Exchange a code or refresh token for tokens. */
export async function requestToken(body: Record<string, string>): Promise<NotionToken> {
  const raw = await fetchJson(`${NOTION_MCP}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const t = parse(tokenResponse, raw, "notion token");
  return parse(notionToken, {
    client_id: body.client_id,
    access_token: t.access_token,
    refresh_token: t.refresh_token || body.refresh_token || "",
    expires_at: Date.now() + t.expires_in * 1000,
  }, "notion token");
}

/** Atomic, and mode 600 even when replacing a file with looser permissions. */
export function saveToken(path: string, t: NotionToken): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(t), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const out = values.out ?? process.env.NOTION_TOKEN_FILE;
  if (!out) fatal("usage: notion-login.ts --out TOKEN_FILE, or set NOTION_TOKEN_FILE");

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") fatal("could not open a local port");
  const redirect = `http://127.0.0.1:${address.port}/callback`;

  const client = parse(registration, await fetchJson(`${NOTION_MCP}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_name: "perf-review", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }),
  }), "notion register");

  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const url = new URL(`${NOTION_MCP}/authorize`);
  url.search = new URLSearchParams({
    response_type: "code", client_id: client.client_id, redirect_uri: redirect, state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
  }).toString();

  const code = new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const u = new URL(req.url ?? "/", redirect);
      if (u.pathname !== "/callback") return void res.writeHead(404).end();
      const got = u.searchParams.get("code");
      const ok = got !== null && u.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" }).end(ok ? "Signed in. You can close this tab." : "Sign-in failed.");
      if (ok) resolve(got);
      else reject(new Error(`sign-in failed: ${u.searchParams.get("error") ?? "state mismatch"}`));
    });
  });

  log(`Opening Notion sign-in in the browser. If it doesn't open, visit:\n${url}`);
  execFile("open", [url.toString()], () => {});
  const token = await requestToken({ grant_type: "authorization_code", code: await code, redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier });
  server.close();
  saveToken(out, token);
  log(`saved Notion token to ${out}`);
}

if (isMain(import.meta.url)) await main();
