import type { IncomingMessage, ServerResponse } from "node:http";

// ── Airtable client ────────────────────────────────────────────────────────
const BASE_URL = "https://api.airtable.com/v0";
const META_URL = "https://api.airtable.com/v0/meta";

class AirtableClient {
  constructor(private token: string) {}

  private async request(url: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) throw new Error(`Airtable API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  listBases() { return this.request(`${META_URL}/bases`); }
  getBaseSchema(baseId: string) { return this.request(`${META_URL}/bases/${baseId}/tables`); }
  createTable(baseId: string, name: string, fields: object[]) {
    return this.request(`${META_URL}/bases/${baseId}/tables`, { method: "POST", body: JSON.stringify({ name, fields }) });
  }
  updateTable(baseId: string, tableId: string, patch: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  createField(baseId: string, tableId: string, field: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}/fields`, { method: "POST", body: JSON.stringify(field) });
  }
  updateField(baseId: string, tableId: string, fieldId: string, patch: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  listRecords(baseId: string, tableId: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.request(`${BASE_URL}/${baseId}/${tableId}${qs}`);
  }
  createRecords(baseId: string, tableId: string, records: object[]) {
    return this.request(`${BASE_URL}/${baseId}/${tableId}`, { method: "POST", body: JSON.stringify({ records }) });
  }
  updateRecords(baseId: string, tableId: string, records: object[]) {
    return this.request(`${BASE_URL}/${baseId}/${tableId}`, { method: "PATCH", body: JSON.stringify({ records }) });
  }
  deleteRecords(baseId: string, tableId: string, recordIds: string[]) {
    const qs = recordIds.map((id) => `records[]=${id}`).join("&");
    return this.request(`${BASE_URL}/${baseId}/${tableId}?${qs}`, { method: "DELETE" });
  }
}

// ── Tool definitions (JSON Schema) ─────────────────────────────────────────
const TOOLS = [
  {
    name: "list_bases",
    description: "List all Airtable bases accessible with the token",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_base_schema",
    description: "Get the full schema (tables + fields) of a base",
    inputSchema: {
      type: "object",
      properties: { baseId: { type: "string", description: "The Airtable base ID (appXXXX)" } },
      required: ["baseId"],
    },
  },
  {
    name: "list_records",
    description: "List records from a table",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string", description: "Table ID or name" },
        maxRecords: { type: "number", description: "Max records to return (default 100)" },
        filterFormula: { type: "string", description: "Airtable filter formula" },
        view: { type: "string" },
      },
      required: ["baseId", "tableId"],
    },
  },
  {
    name: "create_table",
    description: "Create a new table in a base",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        name: { type: "string", description: "Name of the new table" },
        fields: {
          type: "array",
          description: "Initial fields (first must be the primary field)",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", description: "Airtable field type: singleLineText, number, checkbox, date, singleSelect, multipleAttachments, etc." },
              options: { type: "object", description: "Field-specific options (e.g. choices for singleSelect)" },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["baseId", "name", "fields"],
    },
  },
  {
    name: "update_table",
    description: "Rename a table or update its description",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["baseId", "tableId"],
    },
  },
  {
    name: "create_field",
    description: "Add a new field to an existing table",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string" },
        name: { type: "string" },
        type: { type: "string", description: "Airtable field type" },
        options: { type: "object" },
        description: { type: "string" },
      },
      required: ["baseId", "tableId", "name", "type"],
    },
  },
  {
    name: "update_field",
    description: "Update an existing field (rename, change description…)",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string" },
        fieldId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["baseId", "tableId", "fieldId"],
    },
  },
  {
    name: "create_records",
    description: "Create one or more records in a table",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string" },
        records: {
          type: "array",
          items: { type: "object", properties: { fields: { type: "object" } }, required: ["fields"] },
        },
      },
      required: ["baseId", "tableId", "records"],
    },
  },
  {
    name: "update_records",
    description: "Update one or more existing records",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string" },
        records: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, fields: { type: "object" } },
            required: ["id", "fields"],
          },
        },
      },
      required: ["baseId", "tableId", "records"],
    },
  },
  {
    name: "delete_records",
    description: "Delete one or more records by ID",
    inputSchema: {
      type: "object",
      properties: {
        baseId: { type: "string" },
        tableId: { type: "string" },
        recordIds: { type: "array", items: { type: "string" } },
      },
      required: ["baseId", "tableId", "recordIds"],
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────────
async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  const at = new AirtableClient(token);
  switch (name) {
    case "list_bases":
      return at.listBases();
    case "get_base_schema":
      return at.getBaseSchema(args.baseId as string);
    case "list_records": {
      const params: Record<string, string> = {};
      if (args.maxRecords) params.maxRecords = String(args.maxRecords);
      if (args.filterFormula) params.filterByFormula = args.filterFormula as string;
      if (args.view) params.view = args.view as string;
      return at.listRecords(args.baseId as string, args.tableId as string, params);
    }
    case "create_table":
      return at.createTable(args.baseId as string, args.name as string, args.fields as object[]);
    case "update_table": {
      const patch: Record<string, unknown> = {};
      if (args.name) patch.name = args.name;
      if (args.description !== undefined) patch.description = args.description;
      return at.updateTable(args.baseId as string, args.tableId as string, patch);
    }
    case "create_field": {
      const field: Record<string, unknown> = { name: args.name, type: args.type };
      if (args.options) field.options = args.options;
      if (args.description) field.description = args.description;
      return at.createField(args.baseId as string, args.tableId as string, field);
    }
    case "update_field": {
      const patch: Record<string, unknown> = {};
      if (args.name) patch.name = args.name;
      if (args.description !== undefined) patch.description = args.description;
      return at.updateField(args.baseId as string, args.tableId as string, args.fieldId as string, patch);
    }
    case "create_records":
      return at.createRecords(args.baseId as string, args.tableId as string, args.records as object[]);
    case "update_records":
      return at.updateRecords(args.baseId as string, args.tableId as string, args.records as object[]);
    case "delete_records":
      return at.deleteRecords(args.baseId as string, args.tableId as string, args.recordIds as string[]);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getToken(req: IncomingMessage): string {
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  if (process.env.AIRTABLE_API_KEY) return process.env.AIRTABLE_API_KEY;
  throw new Error("Missing Airtable token. Pass Authorization: Bearer <PAT> or set AIRTABLE_API_KEY.");
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// ── Vercel handler ─────────────────────────────────────────────────────────
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let id: unknown = null;
  try {
    const raw = await readBody(req);
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(jsonRpcError(null, -32700, "Parse error")));
      return;
    }

    id = msg.id ?? null;
    const method = msg.method as string;
    const params = (msg.params ?? {}) as Record<string, unknown>;

    // ── initialize ───────────────────────────────────────────────────────
    if (method === "initialize") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "airtable-custom", version: "1.0.0" },
        },
      }));
      return;
    }

    // ── notifications/initialized (no response required) ─────────────────
    if (method === "notifications/initialized") {
      res.writeHead(204).end();
      return;
    }

    // ── tools/list ───────────────────────────────────────────────────────
    if (method === "tools/list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { tools: TOOLS } }));
      return;
    }

    // ── tools/call ───────────────────────────────────────────────────────
    if (method === "tools/call") {
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
      let token: string;
      try {
        token = getToken(req);
      } catch (err: unknown) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify(jsonRpcError(id, -32001, (err as Error).message)));
        return;
      }
      const data = await callTool(toolName, toolArgs, token);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] },
      }));
      return;
    }

    // ── unknown method ────────────────────────────────────────────────────
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonRpcError(id, -32601, `Method not found: ${method}`)));
  } catch (err: unknown) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(jsonRpcError(id, -32603, (err as Error).message)));
    }
  }
}
