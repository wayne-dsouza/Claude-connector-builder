# Lemlist Connector for Claude

A custom [Claude connector](https://support.anthropic.com/en/articles/11175166-about-custom-connectors-remote-mcp) — an **MCP server** — that wraps the [Lemlist](https://www.lemlist.com/) cold‑outreach API. Add it to Claude Code, Claude Desktop, or Claude.ai and ask Claude to manage your Lemlist campaigns, leads, activities, unsubscribes, and webhooks in natural language.

Built on the [Model Context Protocol](https://modelcontextprotocol.io/) TypeScript SDK. Runs two ways:

- **stdio** (default) — local process for Claude Code / Claude Desktop. Your API key never leaves your machine.
- **Streamable HTTP** (`MODE=http`) — a remote endpoint you can host and add to Claude.ai as a custom connector.

---

## What Claude can do with it

24 tools covering the full Lemlist public API:

| Area | Tools |
| --- | --- |
| **Team** | `lemlist_get_team` |
| **Campaigns** | `lemlist_list_campaigns`, `lemlist_get_campaign`, `lemlist_start_campaign_export`, `lemlist_get_campaign_export_status`, `lemlist_export_campaign_leads` |
| **Leads (in a campaign)** | `lemlist_add_lead_to_campaign`, `lemlist_update_lead_in_campaign`, `lemlist_unsubscribe_lead_from_campaign`, `lemlist_delete_lead_from_campaign`, `lemlist_mark_lead_interested_in_campaign`, `lemlist_mark_lead_not_interested_in_campaign` |
| **Leads (global)** | `lemlist_get_lead`, `lemlist_pause_lead`, `lemlist_resume_lead`, `lemlist_mark_lead_interested`, `lemlist_mark_lead_not_interested` |
| **Activities** | `lemlist_get_activities` |
| **Unsubscribes** | `lemlist_list_unsubscribes`, `lemlist_add_unsubscribe`, `lemlist_delete_unsubscribe` |
| **Webhooks** | `lemlist_list_hooks`, `lemlist_add_hook`, `lemlist_delete_hook` |

Example prompts once connected:

- *"List my Lemlist campaigns and show the stats for the one called Q3 Outbound."*
- *"Add richard@piedpiper.com to campaign cam_abc123 with first name Richard and company Pied Piper, and run LinkedIn enrichment."*
- *"Who replied in the last 100 activities?"*
- *"Unsubscribe the whole @competitor.com domain."*

---

## Prerequisites

- **Node.js 18+** (uses the built‑in global `fetch`).
- A **Lemlist API key**. In Lemlist: **Settings → Integrations → API** (`https://app.lemlist.com/settings/integrations`). Generate a key and copy it — Lemlist only shows it once.

## Install & build

```bash
git clone https://github.com/wayne-dsouza/claude-connector-builder.git
cd claude-connector-builder
npm install      # installs deps and builds to dist/
npm run build    # (re)build if needed
npm run smoke    # optional: verify the server starts and lists all 24 tools
```

---

## Use it with Claude Code (local, recommended)

From any project, register the server and pass your key via an environment variable:

```bash
claude mcp add lemlist \
  --env LEMLIST_API_KEY=your_lemlist_api_key \
  -- node /absolute/path/to/claude-connector-builder/dist/index.js
```

Then, in Claude Code, run `/mcp` to confirm `lemlist` is connected. Ask it to "list my Lemlist campaigns".

## Use it with Claude Desktop (local, recommended)

Edit your `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "lemlist": {
      "command": "node",
      "args": ["/absolute/path/to/claude-connector-builder/dist/index.js"],
      "env": {
        "LEMLIST_API_KEY": "your_lemlist_api_key"
      }
    }
  }
}
```

Restart Claude Desktop. The Lemlist tools appear under the connectors/tools menu.

---

## Use it as a remote custom connector (HTTP)

> **Not technical?** Follow the click-by-click, no-terminal guide in **[DEPLOY.md](./DEPLOY.md)** to put it online for free and connect it to Claude in ~10 minutes.

This repo includes a **[`render.yaml`](./render.yaml)** blueprint and a **[`Dockerfile`](./Dockerfile)** so it deploys to common cloud hosts with minimal setup.

Run the server in HTTP mode and expose it over HTTPS (behind a reverse proxy / host of your choice):

```bash
MODE=http PORT=3000 LEMLIST_API_KEY=your_lemlist_api_key npm start
# serves POST https://your-host/mcp  and  GET /health
```

### Adding it to Claude Code (remote)

```bash
claude mcp add --transport http lemlist https://your-host/mcp \
  --header "Authorization: Bearer your_gateway_token"
```

### Adding it to Claude.ai / Claude Desktop (custom connector)

Settings → **Connectors** → **Add custom connector** → paste `https://your-host/mcp`.

### Authentication in HTTP mode

The server resolves the Lemlist API key per request, in this order:

1. `X-Lemlist-Api-Key: <key>` header, else
2. `Authorization: Bearer <key>` header (when no gateway token is configured), else
3. the `LEMLIST_API_KEY` environment variable on the server.

To **protect a shared/hosted endpoint**, set `MCP_AUTH_TOKEN`. When set, every request must send `Authorization: Bearer <MCP_AUTH_TOKEN>` to be accepted, and the Lemlist key is taken from `X-Lemlist-Api-Key` or the server's `LEMLIST_API_KEY`.

> ⚠️ **Security:** anyone who can reach the endpoint with a valid key can act on your Lemlist account. For personal use, prefer the local stdio setup above. If you host the HTTP mode, put it behind HTTPS and set `MCP_AUTH_TOKEN` (or restrict network access). Claude.ai's custom‑connector UI treats a header‑gated URL as "no auth" from its side, so keep the URL secret.

---

## Configuration reference

| Variable | Mode | Default | Description |
| --- | --- | --- | --- |
| `LEMLIST_API_KEY` | both | — | Your Lemlist API key. Required for stdio; the fallback key for HTTP. |
| `MODE` | both | `stdio` | `stdio` or `http`. |
| `PORT` | http | `3000` | Port for the HTTP server. |
| `MCP_AUTH_TOKEN` | http | — | If set, requests must present this as a bearer token. |
| `LEMLIST_BASE_URL` | both | `https://api.lemlist.com/api` | Override the API base URL (rarely needed). |

## Notes on the Lemlist API

- **Base URL:** `https://api.lemlist.com/api`
- **Auth:** HTTP Basic — empty username, API key as password. This connector handles that for you.
- **Rate limit:** 20 requests / 2 seconds per key. The client automatically retries on HTTP 429, honoring the `Retry-After` header.
- Campaign statistics export is asynchronous: call `lemlist_start_campaign_export` to get an `exportId`, then poll `lemlist_get_campaign_export_status` until `status` is `done` to get the CSV download URL.

## Development

```bash
npm run dev     # tsc --watch
npm run build   # compile to dist/
npm run smoke   # handshake + tools/list smoke test (no API key needed)
```

Project layout:

```
src/
  lemlist.ts   # typed Lemlist REST client (auth, retries, errors)
  server.ts    # McpServer + all 24 tool definitions
  index.ts     # entry point: stdio (default) or Streamable HTTP (MODE=http)
scripts/
  smoke-test.mjs
```

## License

MIT — see [LICENSE](./LICENSE).

---

*This project is an independent connector and is not affiliated with or endorsed by Lemlist.*
