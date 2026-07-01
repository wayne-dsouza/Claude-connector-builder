#!/usr/bin/env node
/**
 * Lemlist MCP connector entry point.
 *
 * Two transports:
 *   - stdio (default): for local clients such as Claude Desktop and Claude Code.
 *   - http (MODE=http): Streamable HTTP for use as a remote Claude "custom connector".
 *
 * The Lemlist API key is read from the LEMLIST_API_KEY env var. In HTTP mode it can
 * additionally be supplied per request via the `X-Lemlist-Api-Key` header or a
 * `Authorization: Bearer <key>` header (see resolveApiKey / README).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { LemlistClient } from "./lemlist.js";
import { createLemlistServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const MODE = (process.env.MODE ?? "stdio").toLowerCase();
const PORT = Number(process.env.PORT ?? 3000);
const ENV_API_KEY = process.env.LEMLIST_API_KEY;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

function makeClient(apiKey: string): LemlistClient {
  return new LemlistClient({ apiKey, baseUrl: process.env.LEMLIST_BASE_URL });
}

async function runStdio(): Promise<void> {
  if (!ENV_API_KEY) {
    console.error("[lemlist-mcp] LEMLIST_API_KEY is not set. Export it before starting the server.");
    process.exit(1);
  }
  const server = createLemlistServer(makeClient(ENV_API_KEY));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[lemlist-mcp] ${SERVER_NAME} v${SERVER_VERSION} running on stdio.`);
}

/**
 * Resolve the Lemlist API key + authorization for an incoming HTTP request.
 * Returns the key to use, or an error describing why the request is rejected.
 */
function resolveApiKey(req: Request): { apiKey: string } | { error: string; status: number } {
  const bearer = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const headerKey = req.header("x-lemlist-api-key")?.trim();

  // If a gateway token is configured, the bearer token gates access to the server.
  if (MCP_AUTH_TOKEN) {
    if (bearer !== MCP_AUTH_TOKEN) {
      return { error: "Unauthorized: invalid or missing bearer token.", status: 401 };
    }
    const apiKey = headerKey || ENV_API_KEY;
    if (!apiKey) {
      return { error: "No Lemlist API key: send X-Lemlist-Api-Key or set LEMLIST_API_KEY.", status: 400 };
    }
    return { apiKey };
  }

  // No gateway token: accept the key from a header, a bearer token, or the env var.
  const apiKey = headerKey || bearer || ENV_API_KEY;
  if (!apiKey) {
    return {
      error: "No Lemlist API key: send it via X-Lemlist-Api-Key, Authorization: Bearer <key>, or set LEMLIST_API_KEY.",
      status: 401,
    };
  }
  return { apiKey };
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  // Stateless Streamable HTTP: a fresh server + transport per request.
  app.post("/mcp", async (req: Request, res: Response) => {
    const resolved = resolveApiKey(req);
    if ("error" in resolved) {
      jsonRpcError(res, resolved.status, resolved.error);
      return;
    }

    const server = createLemlistServer(makeClient(resolved.apiKey));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[lemlist-mcp] Error handling /mcp request:", err);
      if (!res.headersSent) {
        jsonRpcError(res, 500, `Internal server error: ${(err as Error).message}`);
      }
    }
  });

  // Stateless mode does not support server-initiated SSE streams or session teardown.
  const methodNotAllowed = (_req: Request, res: Response) =>
    jsonRpcError(res, 405, "Method not allowed. This stateless server only accepts POST /mcp.");
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(PORT, () => {
    console.error(`[lemlist-mcp] ${SERVER_NAME} v${SERVER_VERSION} listening on http://0.0.0.0:${PORT}/mcp`);
    if (MCP_AUTH_TOKEN) {
      console.error("[lemlist-mcp] Bearer-token gating is ENABLED (MCP_AUTH_TOKEN set).");
    }
  });
}

async function main(): Promise<void> {
  if (MODE === "http") {
    await runHttp();
  } else {
    await runStdio();
  }
}

main().catch((err) => {
  console.error("[lemlist-mcp] Fatal error:", err);
  process.exit(1);
});
