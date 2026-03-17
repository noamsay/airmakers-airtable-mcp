import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { AirtableClient } from "../src/airtable.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ── Auth helper ────────────────────────────────────────────────────────────
function getToken(req: IncomingMessage): string {
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const envToken = process.env.AIRTABLE_API_KEY;
  if (envToken) return envToken;
  throw new Error("Missing Airtable token. Pass Authorization: Bearer <PAT> or set AIRTABLE_API_KEY.");
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

// ── Server factory ─────────────────────────────────────────────────────────
function createMcpServer(token: string) {
  const airtable = new AirtableClient(token);
  const server = new McpServer({
    name: "airtable-custom",
    version: "1.0.0",
  });

  // ── READ TOOLS ─────────────────────────────────────────────────────────────

  server.tool("list_bases", "List all Airtable bases accessible with the token", {}, async () => {
    const data = await airtable.listBases();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool(
    "get_base_schema",
    "Get the full schema (tables + fields) of a base",
    { baseId: z.string().describe("The Airtable base ID (appXXXX)") },
    async ({ baseId }) => {
      const data = await airtable.getBaseSchema(baseId);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_records",
    "List records from a table",
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

  // ── SCHEMA WRITE TOOLS ────────────────────────────────────────────────────

  server.tool(
    "create_table",
    "Create a new table in a base",
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

  server.tool(
    "create_field",
    "Add a new field to an existing table",
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

  server.tool(
    "update_field",
    "Update an existing field (rename, change description…)",
    {
      baseId: z.string(),
      tableId: z.string(),
      fieldId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ baseId, tableId, fieldId, name, description }) => {
      const patch: Record<string, unknown> = {};
      if (name) patch.name = name;
      if (description !== undefined) patch.description = description;
      const data = await airtable.updateField(baseId, tableId, fieldId, patch);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "update_table",
    "Rename a table or update its description",
    {
      baseId: z.string(),
      tableId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ baseId, tableId, name, description }) => {
      const patch: Record<string, unknown> = {};
      if (name) patch.name = name;
      if (description !== undefined) patch.description = description;
      const data = await airtable.updateTable(baseId, tableId, patch);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── RECORD WRITE TOOLS ────────────────────────────────────────────────────

  server.tool(
    "create_records",
    "Create one or more records in a table",
    {
      baseId: z.string(),
      tableId: z.string(),
      records: z.array(z.object({ fields: z.record(z.unknown()) })),
    },
    async ({ baseId, tableId, records }) => {
      const data = await airtable.createRecords(baseId, tableId, records);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "update_records",
    "Update one or more existing records",
    {
      baseId: z.string(),
      tableId: z.string(),
      records: z.array(z.object({ id: z.string(), fields: z.record(z.unknown()) })),
    },
    async ({ baseId, tableId, records }) => {
      const data = await airtable.updateRecords(baseId, tableId, records);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "delete_records",
    "Delete one or more records by ID",
    {
      baseId: z.string(),
      tableId: z.string(),
      recordIds: z.array(z.string()),
    },
    async ({ baseId, tableId, recordIds }) => {
      const data = await airtable.deleteRecords(baseId, tableId, recordIds);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

// ── Vercel serverless handler (default export) ─────────────────────────────
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  try {
    const token = getToken(req);
    const mcpServer = createMcpServer(token);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => transport.close());
    await mcpServer.connect(transport);

    const body = req.method === "POST" ? await getRawBody(req) : Buffer.alloc(0);
    await transport.handleRequest(req, res, body);
  } catch (err: any) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}
