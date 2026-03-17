import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ── Airtable client (inlined) ──────────────────────────────────────────────
const BASE_URL = "https://api.airtable.com/v0";
const META_URL = "https://api.airtable.com/v0/meta";

class AirtableClient {
  private token: string;
  constructor(token: string) { this.token = token; }

  private async request(url: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable API error ${res.status}: ${err}`);
    }
    return res.json();
  }

  async listBases() { return this.request(`${META_URL}/bases`); }
  async getBaseSchema(baseId: string) { return this.request(`${META_URL}/bases/${baseId}/tables`); }
  async createTable(baseId: string, name: string, fields: object[]) {
    return this.request(`${META_URL}/bases/${baseId}/tables`, { method: "POST", body: JSON.stringify({ name, fields }) });
  }
  async updateTable(baseId: string, tableId: string, patch: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  async createField(baseId: string, tableId: string, field: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}/fields`, { method: "POST", body: JSON.stringify(field) });
  }
  async updateField(baseId: string, tableId: string, fieldId: string, patch: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  async listRecords(baseId: string, tableId: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.request(`${BASE_URL}/${baseId}/${tableId}${qs}`);
  }
  async createRecords(baseId: string, tableId: string, records: object[]) {
    return this.request(`${BASE_URL}/${baseId}/${tableId}`, { method: "POST", body: JSON.stringify({ records }) });
  }
  async updateRecords(baseId: string, tableId: string, records: object[]) {
    return this.request(`${BASE_URL}/${baseId}/${tableId}`, { method: "PATCH", body: JSON.stringify({ records }) });
  }
  async deleteRecords(baseId: string, tableId: string, recordIds: string[]) {
    const qs = recordIds.map((id) => `records[]=${id}`).join("&");
    return this.request(`${BASE_URL}/${baseId}/${tableId}?${qs}`, { method: "DELETE" });
  }
}

// ── Auth helper ────────────────────────────────────────────────────────────
function getToken(req: IncomingMessage): string {
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const envToken = process.env.AIRTABLE_API_KEY;
  if (envToken) return envToken;
  throw new Error("Missing Airtable token. Pass Authorization: Bearer <PAT> or set AIRTABLE_API_KEY.");
}

// ── MCP server factory ─────────────────────────────────────────────────────
function createMcpServer(token: string) {
  const airtable = new AirtableClient(token);
  const server = new McpServer({ name: "airtable-custom", version: "1.0.0" });

  server.tool("list_bases", "List all Airtable bases accessible with the token", {}, async () => {
    const data = await airtable.listBases();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("get_base_schema", "Get the full schema (tables + fields) of a base",
    { baseId: z.string().describe("The Airtable base ID (appXXXX)") },
    async ({ baseId }) => {
      const data = await airtable.getBaseSchema(baseId);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("list_records", "List records from a table",
    {
      baseId: z.string(),
      tableId: z.string().describe("Table ID or name"),
      maxRecords: z.number().optional().describe("Max records to return (default 100)"),
      filterFormula: z.string().optional().describe("Airtable filter formula"),
      view: z.string().optional(),
    },
    async ({ baseId, tableId, maxRecords, filterFormula, view }) => {
      const params: Record<string, string> = {};
      if (maxRecords) params.maxRecords = String(maxRecords);
      if (filterFormula) params.filterByFormula = filterFormula;
      if (view) params.view = view;
      const data = await airtable.listRecords(baseId, tableId, params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("create_table", "Create a new table in a base",
    {
      baseId: z.string(),
      name: z.string().describe("Name of the new table"),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string().describe("Airtable field type: singleLineText, number, checkbox, date, singleSelect, multipleAttachments, etc."),
        options: z.record(z.unknown()).optional().describe("Field-specific options (e.g. choices for singleSelect)"),
      })).describe("Initial fields for the table (first field must be the primary field)"),
    },
    async ({ baseId, name, fields }) => {
      const data = await airtable.createTable(baseId, name, fields);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("update_table", "Rename a table or update its description",
    { baseId: z.string(), tableId: z.string(), name: z.string().optional(), description: z.string().optional() },
    async ({ baseId, tableId, name, description }) => {
      const patch: Record<string, unknown> = {};
      if (name) patch.name = name;
      if (description !== undefined) patch.description = description;
      const data = await airtable.updateTable(baseId, tableId, patch);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("create_field", "Add a new field to an existing table",
    {
      baseId: z.string(),
      tableId: z.string(),
      name: z.string(),
      type: z.string().describe("Airtable field type"),
      options: z.record(z.unknown()).optional(),
      description: z.string().optional(),
    },
    async ({ baseId, tableId, name, type, options, description }) => {
      const field: Record<string, unknown> = { name, type };
      if (options) field.options = options;
      if (description) field.description = description;
      const data = await airtable.createField(baseId, tableId, field);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("update_field", "Update an existing field (rename, change description…)",
    { baseId: z.string(), tableId: z.string(), fieldId: z.string(), name: z.string().optional(), description: z.string().optional() },
    async ({ baseId, tableId, fieldId, name, description }) => {
      const patch: Record<string, unknown> = {};
      if (name) patch.name = name;
      if (description !== undefined) patch.description = description;
      const data = await airtable.updateField(baseId, tableId, fieldId, patch);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("create_records", "Create one or more records in a table",
    { baseId: z.string(), tableId: z.string(), records: z.array(z.object({ fields: z.record(z.unknown()) })) },
    async ({ baseId, tableId, records }) => {
      const data = await airtable.createRecords(baseId, tableId, records);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("update_records", "Update one or more existing records",
    { baseId: z.string(), tableId: z.string(), records: z.array(z.object({ id: z.string(), fields: z.record(z.unknown()) })) },
    async ({ baseId, tableId, records }) => {
      const data = await airtable.updateRecords(baseId, tableId, records);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("delete_records", "Delete one or more records by ID",
    { baseId: z.string(), tableId: z.string(), recordIds: z.array(z.string()) },
    async ({ baseId, tableId, recordIds }) => {
      const data = await airtable.deleteRecords(baseId, tableId, recordIds);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

// ── Raw body helper ────────────────────────────────────────────────────────
async function getRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── CORS headers ───────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
};

// ── Vercel serverless handler ──────────────────────────────────────────────
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  try {
    const token = getToken(req);
    const mcpServer = createMcpServer(token);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, await getRawBody(req));
  } catch (err: any) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}
