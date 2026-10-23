# pdf-tables

Extract tables from PDFs into CSV or JSON. Built as an agent skill: the agent reads `SKILL.md` and runs `scripts/extract_tables.py`.

## Install

```bash
skihost install skihost/pdf-tables --claude
pip install pdfplumber pandas
```

## Use it yourself

```bash
python scripts/extract_tables.py invoice.pdf --format csv
python scripts/extract_tables.py report.pdf --pages 2-4 --out-dir tables/
```

## How it works

`pdfplumber` finds ruled and whitespace-aligned tables on each page. The script normalises whitespace in cells, drops empty rows, and merges tables that continue across a page break when their headers match.

## Limits

- Scanned PDFs need OCR first (no text layer, no tables).
- Very irregular layouts may split one table into several; check the `page`/`index` fields.
