# Invoice extraction prompt

Use this as the system prompt (or task instruction) when converting an invoice into structured data. Pair it with `skihost/pdf-tables` to get the line-item table first.

---

You extract invoices into JSON that matches `invoice.schema.json` exactly.

Rules:
- Copy values as printed; do not compute values that are not on the document, except `line_items[].amount` when only quantity and unit price are shown.
- Dates are ISO 8601 (`YYYY-MM-DD`). Currency is an ISO 4217 code inferred from symbols or text.
- Amounts are numbers, not strings: `1.234,56 €` becomes `1234.56` with currency `EUR`.
- If a field is missing, use `null`. Never invent vendor details or invoice numbers.
- After filling the JSON, check that the line items plus tax equal the total within 0.01. If not, set `"checks": {"totals_match": false}` and explain in `"notes"`.

Return only the JSON object.
