/**
 * Minimal, typed client for the Lemlist REST API.
 *
 * Docs: https://developer.lemlist.com/
 * Base URL: https://api.lemlist.com/api
 * Auth:    HTTP Basic — empty username, API key as password.
 * Limits:  20 requests / 2 seconds per API key.
 */

const DEFAULT_BASE_URL = "https://api.lemlist.com/api";

export interface LemlistClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Max automatic retries on HTTP 429 (rate limit). Default 3. */
  maxRetries?: number;
  /** Request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
}

export class LemlistError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "LemlistError";
    this.status = status;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** When true, resolve with the raw text (e.g. CSV exports) instead of JSON. */
  raw?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class LemlistClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly authHeader: string;

  constructor(options: LemlistClientOptions) {
    if (!options.apiKey) {
      throw new Error("A Lemlist API key is required.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    // Basic auth: empty login, API key as password.
    this.authHeader =
      "Basic " + Buffer.from(`:${this.apiKey}`).toString("base64");
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", query, body, raw = false } = options;
    const url = this.buildUrl(path, query);

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: raw ? "text/csv, */*" : "application/json",
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    let attempt = 0;
    // Retry loop for transient rate-limit (429) responses.
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          throw new LemlistError(0, `Request timed out after ${this.timeoutMs}ms: ${method} ${path}`, null);
        }
        throw new LemlistError(0, `Network error calling Lemlist: ${(err as Error).message}`, null);
      }
      clearTimeout(timer);

      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1);
        attempt += 1;
        await sleep(waitMs);
        continue;
      }

      const text = await response.text();

      if (!response.ok) {
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          /* keep raw text */
        }
        const message =
          (parsed && typeof parsed === "object" && "message" in parsed
            ? String((parsed as Record<string, unknown>).message)
            : undefined) ?? `Lemlist API error ${response.status} on ${method} ${path}`;
        throw new LemlistError(response.status, message, parsed);
      }

      if (raw) {
        return text as unknown as T;
      }
      if (!text) {
        return null as unknown as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }
  }

  // ----- Team -------------------------------------------------------------
  getTeam() {
    return this.request("/team");
  }

  // ----- Campaigns --------------------------------------------------------
  listCampaigns(params: { offset?: number; limit?: number } = {}) {
    return this.request("/campaigns", { query: params });
  }

  getCampaign(campaignId: string) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}`);
  }

  startCampaignExport(campaignId: string) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/export/start`);
  }

  getCampaignExportStatus(campaignId: string, exportId: string) {
    return this.request(
      `/campaigns/${encodeURIComponent(campaignId)}/export/${encodeURIComponent(exportId)}/status`,
    );
  }

  exportCampaignLeads(campaignId: string, state = "all") {
    return this.request<string>(
      `/campaigns/${encodeURIComponent(campaignId)}/export/leads`,
      { query: { state }, raw: true },
    );
  }

  // ----- Leads (campaign-scoped) -----------------------------------------
  addLeadToCampaign(
    campaignId: string,
    email: string | undefined,
    fields: Record<string, unknown> | undefined,
    flags: { deduplicate?: boolean; findEmail?: boolean; linkedinEnrichment?: boolean; verifyEmail?: boolean } = {},
  ) {
    const emailSegment = email ? `/${encodeURIComponent(email)}` : "";
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/leads${emailSegment}`, {
      method: "POST",
      query: flags as Record<string, QueryValue>,
      body: fields && Object.keys(fields).length > 0 ? fields : undefined,
    });
  }

  updateLeadInCampaign(campaignId: string, email: string, fields: Record<string, unknown>) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: fields,
    });
  }

  unsubscribeLeadFromCampaign(campaignId: string, email: string) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
  }

  deleteLeadFromCampaign(campaignId: string, email: string) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(email)}`, {
      method: "DELETE",
      query: { action: "remove" },
    });
  }

  markLeadInterestedInCampaign(campaignId: string, email: string) {
    return this.request(
      `/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(email)}/interested`,
      { method: "POST" },
    );
  }

  markLeadNotInterestedInCampaign(campaignId: string, email: string) {
    return this.request(
      `/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(email)}/notinterested`,
      { method: "POST" },
    );
  }

  // ----- Leads (global) ---------------------------------------------------
  getLead(params: { email?: string; id?: string; campaignId?: string }) {
    if (params.email) {
      return this.request(`/leads/${encodeURIComponent(params.email)}`, {
        query: { campaignId: params.campaignId },
      });
    }
    return this.request("/leads", { query: { id: params.id, campaignId: params.campaignId } });
  }

  pauseLead(email: string, campaignId?: string) {
    return this.request(`/leads/pause/${encodeURIComponent(email)}`, {
      method: "POST",
      query: { campaignId },
    });
  }

  resumeLead(email: string, campaignId?: string) {
    return this.request(`/leads/start/${encodeURIComponent(email)}`, {
      method: "POST",
      query: { campaignId },
    });
  }

  markLeadInterested(email: string) {
    return this.request(`/leads/interested/${encodeURIComponent(email)}`, { method: "POST" });
  }

  markLeadNotInterested(email: string) {
    return this.request(`/leads/notinterested/${encodeURIComponent(email)}`, { method: "POST" });
  }

  // ----- Activities -------------------------------------------------------
  getActivities(
    params: { type?: string; campaignId?: string; isFirst?: boolean; offset?: number; limit?: number } = {},
  ) {
    return this.request("/activities", { query: params });
  }

  // ----- Unsubscribes -----------------------------------------------------
  listUnsubscribes(params: { offset?: number; limit?: number } = {}) {
    return this.request("/unsubscribes", { query: params });
  }

  addUnsubscribe(emailOrDomain: string) {
    return this.request(`/unsubscribes/${encodeURIComponent(emailOrDomain)}`, { method: "POST" });
  }

  deleteUnsubscribe(email: string) {
    return this.request(`/unsubscribes/${encodeURIComponent(email)}`, { method: "DELETE" });
  }

  // ----- Hooks (webhooks) -------------------------------------------------
  listHooks() {
    return this.request("/hooks");
  }

  addHook(body: { targetUrl: string; type?: string; campaignId?: string; isFirst?: boolean }) {
    return this.request("/hooks", { method: "POST", body });
  }

  deleteHook(hookId: string) {
    return this.request(`/hooks/${encodeURIComponent(hookId)}`, { method: "DELETE" });
  }
}
