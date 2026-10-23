---
name: pdf-tables
description: Extract tables from PDF files into CSV or JSON. Use when a task involves reading tabular data (invoices, bank statements, reports) out of PDFs.
---

# PDF tables

Turn the tables inside a PDF into structured data.

## When to use

- The user hands you a PDF and wants the numbers in it (line items, totals, transactions).
- You need to compare or aggregate tables across many PDFs.
- Plain text extraction loses the column structure.

Not for scanned images without a text layer — run OCR first.

## Instructions

1. Make sure the requirements are installed: `pip install pdfplumber pandas`.
2. Run the bundled script on the file:

   ```bash
   python scripts/extract_tables.py invoice.pdf --format json > tables.json
   ```

   Options:
   - `--format csv|json` (default `json`)
   - `--pages 1,3-5` to limit pages
   - `--out-dir DIR` writes one CSV per table instead of printing

3. Inspect the output. Each table has `page`, `index`, `header` and `rows`.
   Tables that continue across a page break are merged when their headers match.
4. Clean up before using the numbers: strip currency symbols, convert `1.234,56`-style
   decimals when the document is European, and drop repeated header rows.
5. Report what you extracted (page and table counts) so the user can spot gaps.

## Example

```text
$ python scripts/extract_tables.py statement.pdf --pages 2
[{"page": 2, "index": 0, "header": ["Date", "Description", "Amount"],
  "rows": [["2026-01-03", "Coffee", "-3.40"], ...]}]
```
