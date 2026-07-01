import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LemlistClient, LemlistError } from "./lemlist.js";

export const SERVER_NAME = "lemlist-connector";
export const SERVER_VERSION = "1.0.0";

function toText(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text: text || "(empty response)" }] };
}

/** Wrap a handler so Lemlist/API failures become readable, non-throwing tool errors. */
function handle(fn: () => Promise<unknown>): () => Promise<CallToolResult> {
  return async () => {
    try {
      return toText(await fn());
    } catch (err) {
      if (err instanceof LemlistError) {
        const detail = err.body ? `\n${JSON.stringify(err.body, null, 2)}` : "";
        return {
          isError: true,
          content: [{ type: "text", text: `Lemlist API error (HTTP ${err.status}): ${err.message}${detail}` }],
        };
      }
      return {
        isError: true,
        content: [{ type: "text", text: `Unexpected error: ${(err as Error).message}` }],
      };
    }
  };
}

/**
 * Build an MCP server exposing the Lemlist API as tools, backed by the given client.
 * A fresh server (and client) can be created per request in HTTP mode, or once in stdio mode.
 */
export function createLemlistServer(client: LemlistClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Tools for the Lemlist cold-outreach platform: manage campaigns, leads, activities, " +
        "unsubscribes and webhooks. Campaign IDs look like 'cam_...', lead IDs like 'lea_...', " +
        "hook IDs like 'hoo_...'. Most lead operations are keyed by email address.",
    },
  );

  const email = z.string().describe("Lead email address, e.g. richard@piedpiper.com");
  const campaignId = z.string().describe("Campaign ID, e.g. cam_aaWL92T22Sei3Bz6v");

  // ----- Team ------------------------------------------------------------
  server.registerTool(
    "lemlist_get_team",
    {
      title: "Get team info",
      description: "Retrieve information about your Lemlist team (name, users, custom domain).",
      annotations: { readOnlyHint: true },
    },
    handle(() => client.getTeam()),
  );

  // ----- Campaigns -------------------------------------------------------
  server.registerTool(
    "lemlist_list_campaigns",
    {
      title: "List campaigns",
      description: "List all campaigns. Supports pagination via offset/limit (max 100 per page).",
      inputSchema: {
        offset: z.number().int().min(0).optional().describe("Offset from the start, for pagination."),
        limit: z.number().int().min(1).max(100).optional().describe("Number of campaigns to return (max 100)."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.listCampaigns(args))(),
  );

  server.registerTool(
    "lemlist_get_campaign",
    {
      title: "Get campaign",
      description: "Retrieve a single campaign by its ID.",
      inputSchema: { campaignId },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.getCampaign(args.campaignId))(),
  );

  server.registerTool(
    "lemlist_start_campaign_export",
    {
      title: "Start campaign statistics export",
      description:
        "Start an asynchronous export of a campaign's statistics (CSV). Returns an export ID; " +
        "poll lemlist_get_campaign_export_status until status is 'done' to get the download URL.",
      inputSchema: { campaignId },
    },
    (args) => handle(() => client.startCampaignExport(args.campaignId))(),
  );

  server.registerTool(
    "lemlist_get_campaign_export_status",
    {
      title: "Get campaign export status",
      description:
        "Check the status of an asynchronous campaign export. When status is 'done', the result " +
        "includes the CSV download URL (available for 24h). Statuses expire after 2h.",
      inputSchema: {
        campaignId,
        exportId: z.string().describe("Export ID returned by lemlist_start_campaign_export, e.g. exp_123456"),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.getCampaignExportStatus(args.campaignId, args.exportId))(),
  );

  server.registerTool(
    "lemlist_export_campaign_leads",
    {
      title: "Export campaign leads (CSV)",
      description:
        "Synchronously export a campaign's leads as CSV text. Use the 'state' filter to select " +
        "which lead states to include (e.g. 'all', 'emailsOpened', 'hooked', 'interested').",
      inputSchema: {
        campaignId,
        state: z
          .string()
          .optional()
          .describe("Lead state filter. Default 'all'. Examples: all, contacted, hooked, warmed, interested, emailsOpened."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.exportCampaignLeads(args.campaignId, args.state ?? "all"))(),
  );

  // ----- Leads (campaign-scoped) ----------------------------------------
  server.registerTool(
    "lemlist_add_lead_to_campaign",
    {
      title: "Add lead to campaign",
      description:
        "Add (and create if needed) a lead in a campaign. Email is optional. Provide custom lead " +
        "fields via 'fields' (firstName, lastName, companyName, icebreaker, phone, picture, " +
        "linkedinUrl, companyDomain, or any custom variable). Optional enrichment flags available.",
      inputSchema: {
        campaignId,
        email: z.string().optional().describe("Lead email (optional)."),
        fields: z
          .record(z.any())
          .optional()
          .describe("Lead fields, e.g. { firstName, lastName, companyName, icebreaker, phone, linkedinUrl }."),
        deduplicate: z.boolean().optional().describe("Skip insert if the email already exists in another campaign."),
        findEmail: z.boolean().optional().describe("Find a verified email for the lead."),
        linkedinEnrichment: z.boolean().optional().describe("Run LinkedIn enrichment on the lead."),
        verifyEmail: z.boolean().optional().describe("Verify the lead's existing email (debounce)."),
      },
    },
    (args) =>
      handle(() =>
        client.addLeadToCampaign(args.campaignId, args.email, args.fields, {
          deduplicate: args.deduplicate,
          findEmail: args.findEmail,
          linkedinEnrichment: args.linkedinEnrichment,
          verifyEmail: args.verifyEmail,
        }),
      )(),
  );

  server.registerTool(
    "lemlist_update_lead_in_campaign",
    {
      title: "Update lead in campaign",
      description: "Update a lead's fields within a specific campaign. Returns 404 if the lead does not exist.",
      inputSchema: {
        campaignId,
        email,
        fields: z.record(z.any()).describe("Fields to update, e.g. { companyName: 'Pied Piper' }."),
      },
    },
    (args) => handle(() => client.updateLeadInCampaign(args.campaignId, args.email, args.fields))(),
  );

  server.registerTool(
    "lemlist_unsubscribe_lead_from_campaign",
    {
      title: "Unsubscribe lead from campaign",
      description:
        "Unsubscribe a lead (from all campaigns) using their membership in the given campaign. " +
        "The lead's data is kept; use lemlist_delete_lead_from_campaign to remove it entirely.",
      inputSchema: { campaignId, email },
    },
    (args) => handle(() => client.unsubscribeLeadFromCampaign(args.campaignId, args.email))(),
  );

  server.registerTool(
    "lemlist_delete_lead_from_campaign",
    {
      title: "Delete lead from campaign",
      description: "Permanently delete a lead from a campaign, including all of its statistics. This cannot be undone.",
      inputSchema: { campaignId, email },
      annotations: { destructiveHint: true },
    },
    (args) => handle(() => client.deleteLeadFromCampaign(args.campaignId, args.email))(),
  );

  server.registerTool(
    "lemlist_mark_lead_interested_in_campaign",
    {
      title: "Mark lead interested (in campaign)",
      description: "Mark a lead as 'interested' within a specific campaign.",
      inputSchema: { campaignId, email },
    },
    (args) => handle(() => client.markLeadInterestedInCampaign(args.campaignId, args.email))(),
  );

  server.registerTool(
    "lemlist_mark_lead_not_interested_in_campaign",
    {
      title: "Mark lead not interested (in campaign)",
      description: "Mark a lead as 'not interested' within a specific campaign.",
      inputSchema: { campaignId, email },
    },
    (args) => handle(() => client.markLeadNotInterestedInCampaign(args.campaignId, args.email))(),
  );

  // ----- Leads (global) --------------------------------------------------
  server.registerTool(
    "lemlist_get_lead",
    {
      title: "Get lead",
      description:
        "Retrieve a lead by email (preferred) or by lead ID. Optionally scope the lookup to a single campaign.",
      inputSchema: {
        email: z.string().optional().describe("Lead email address (preferred)."),
        id: z.string().optional().describe("Lead ID, e.g. lea_aaNfSAHJoa4gj86Px (used when email is omitted)."),
        campaignId: z.string().optional().describe("Restrict the lookup to this campaign only."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.getLead(args))(),
  );

  server.registerTool(
    "lemlist_pause_lead",
    {
      title: "Pause lead",
      description: "Pause a lead by email across all campaigns, or in one campaign if campaignId is given.",
      inputSchema: { email, campaignId: z.string().optional().describe("Restrict to this campaign (optional).") },
    },
    (args) => handle(() => client.pauseLead(args.email, args.campaignId))(),
  );

  server.registerTool(
    "lemlist_resume_lead",
    {
      title: "Resume lead",
      description: "Resume (start) a paused lead by email across all campaigns, or in one campaign if campaignId is given.",
      inputSchema: { email, campaignId: z.string().optional().describe("Restrict to this campaign (optional).") },
    },
    (args) => handle(() => client.resumeLead(args.email, args.campaignId))(),
  );

  server.registerTool(
    "lemlist_mark_lead_interested",
    {
      title: "Mark lead interested (all campaigns)",
      description: "Mark a lead as 'interested' by email across all campaigns.",
      inputSchema: { email },
    },
    (args) => handle(() => client.markLeadInterested(args.email))(),
  );

  server.registerTool(
    "lemlist_mark_lead_not_interested",
    {
      title: "Mark lead not interested (all campaigns)",
      description: "Mark a lead as 'not interested' by email across all campaigns.",
      inputSchema: { email },
    },
    (args) => handle(() => client.markLeadNotInterested(args.email))(),
  );

  // ----- Activities ------------------------------------------------------
  server.registerTool(
    "lemlist_get_activities",
    {
      title: "Get activities",
      description:
        "Retrieve recent activities (up to 100 per page). Filter by activity type (e.g. emailsSent, " +
        "emailsOpened, emailsReplied, linkedinReplied), campaign, or first-occurrence only.",
      inputSchema: {
        type: z
          .string()
          .optional()
          .describe("Activity type filter, e.g. emailsSent, emailsOpened, emailsClicked, emailsReplied, emailsBounced."),
        campaignId: z.string().optional().describe("Restrict to a single campaign."),
        isFirst: z.boolean().optional().describe("Only the first time each activity happened."),
        offset: z.number().int().min(0).optional().describe("Offset from the start, for pagination."),
        limit: z.number().int().min(1).max(100).optional().describe("Number of activities to return (max 100)."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.getActivities(args))(),
  );

  // ----- Unsubscribes ----------------------------------------------------
  server.registerTool(
    "lemlist_list_unsubscribes",
    {
      title: "List unsubscribes",
      description: "List all unsubscribed email addresses. Supports offset/limit pagination.",
      inputSchema: {
        offset: z.number().int().min(0).optional().describe("Offset from the start, for pagination."),
        limit: z.number().int().min(1).optional().describe("Number of entries to return (default 100)."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => handle(() => client.listUnsubscribes(args))(),
  );

  server.registerTool(
    "lemlist_add_unsubscribe",
    {
      title: "Add to unsubscribes",
      description:
        "Add an email address or an entire domain to the unsubscribe list. To unsubscribe a domain, " +
        "prefix it with '@' (e.g. '@example.com').",
      inputSchema: {
        emailOrDomain: z.string().describe("Email address, or a domain starting with '@', e.g. @example.com"),
      },
    },
    (args) => handle(() => client.addUnsubscribe(args.emailOrDomain))(),
  );

  server.registerTool(
    "lemlist_delete_unsubscribe",
    {
      title: "Remove from unsubscribes",
      description: "Remove an email address from the unsubscribe list.",
      inputSchema: { email },
    },
    (args) => handle(() => client.deleteUnsubscribe(args.email))(),
  );

  // ----- Hooks (webhooks) ------------------------------------------------
  server.registerTool(
    "lemlist_list_hooks",
    {
      title: "List webhooks",
      description: "List all webhooks registered for your team.",
      annotations: { readOnlyHint: true },
    },
    handle(() => client.listHooks()),
  );

  server.registerTool(
    "lemlist_add_hook",
    {
      title: "Add webhook",
      description:
        "Register a webhook. Lemlist will POST event data to targetUrl. Optionally scope it to a single " +
        "event type and/or campaign, and to first occurrences only.",
      inputSchema: {
        targetUrl: z.string().url().describe("URL Lemlist should call when an event occurs."),
        type: z
          .string()
          .optional()
          .describe("Only fire for this event type (e.g. emailsReplied, emailsOpened, linkedinReplied)."),
        campaignId: z.string().optional().describe("Only fire for this campaign."),
        isFirst: z.boolean().optional().describe("Only fire the first time an activity happens."),
      },
    },
    (args) =>
      handle(() =>
        client.addHook({
          targetUrl: args.targetUrl,
          type: args.type,
          campaignId: args.campaignId,
          isFirst: args.isFirst,
        }),
      )(),
  );

  server.registerTool(
    "lemlist_delete_hook",
    {
      title: "Delete webhook",
      description: "Delete a webhook by its ID.",
      inputSchema: { hookId: z.string().describe("Hook ID, e.g. hoo_aadabFv7dRoP2L8GJ") },
      annotations: { destructiveHint: true },
    },
    (args) => handle(() => client.deleteHook(args.hookId))(),
  );

  return server;
}
