# invoice-schema

A prompt plus a JSON Schema for extracting invoices into structured data that downstream code can trust.

| File | Purpose |
| --- | --- |
| `prompt.md` | The extraction instructions, including a totals check |
| `invoice.schema.json` | JSON Schema (draft 2020-12) for the output |

Works well after `skihost/pdf-tables` has pulled the line-item table out of the PDF.

```bash
skihost install skihost/invoice-schema
```
