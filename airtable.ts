const BASE_URL = "https://api.airtable.com/v0";
const META_URL = "https://api.airtable.com/v0/meta";

export class AirtableClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

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

  // ── BASES ──────────────────────────────────────────────────────────────────
  async listBases() {
    return this.request(`${META_URL}/bases`);
  }

  async getBaseSchema(baseId: string) {
    return this.request(`${META_URL}/bases/${baseId}/tables`);
  }

  // ── TABLES ─────────────────────────────────────────────────────────────────
  async createTable(baseId: string, name: string, fields: object[]) {
    return this.request(`${META_URL}/bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify({ name, fields }),
    });
  }

  async updateTable(baseId: string, tableId: string, patch: object) {
    return this.request(`${META_URL}/bases/${baseId}/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  // ── FIELDS ─────────────────────────────────────────────────────────────────
  async createField(baseId: string, tableId: string, field: object) {
    return this.request(
      `${META_URL}/bases/${baseId}/tables/${tableId}/fields`,
      { method: "POST", body: JSON.stringify(field) }
    );
  }

  async updateField(
    baseId: string,
    tableId: string,
    fieldId: string,
    patch: object
  ) {
    return this.request(
      `${META_URL}/bases/${baseId}/tables/${tableId}/fields/${fieldId}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
  }

  // ── RECORDS ────────────────────────────────────────────────────────────────
  async listRecords(baseId: string, tableId: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.request(`${BASE_URL}/${baseId}/${tableId}${qs}`);
  }

  async createRecords(baseId: string, tableId: string, records: object[]) {
    return this.request(`${BASE_URL}/${baseId}/${tableId}`, {
      method: "POST",
      body: JSON.stringify({ records }),
    });
  }

  async updateRecords(baseId: string, tableId: string, records: object[]) {
    return this.request(`${BASE_URL}/${baseId}/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ records }),
    });
  }

  async deleteRecords(baseId: string, tableId: string, recordIds: string[]) {
    const qs = recordIds.map((id) => `records[]=${id}`).join("&");
    return this.request(`${BASE_URL}/${baseId}/${tableId}?${qs}`, {
      method: "DELETE",
    });
  }
}
