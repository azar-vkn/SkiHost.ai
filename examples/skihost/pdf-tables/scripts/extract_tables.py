#!/usr/bin/env python3
"""Extract tables from a PDF into JSON or CSV.

Usage: extract_tables.py FILE.pdf [--format json|csv] [--pages 1,3-5] [--out-dir DIR]
"""
import argparse
import csv
import json
import os
import sys

import pdfplumber


def parse_pages(spec, total):
    if not spec:
        return list(range(1, total + 1))
    pages = set()
    for part in spec.split(","):
        if "-" in part:
            start, end = part.split("-", 1)
            pages.update(range(int(start), int(end) + 1))
        else:
            pages.add(int(part))
    return sorted(p for p in pages if 1 <= p <= total)


def clean(cell):
    return " ".join(str(cell).split()) if cell is not None else ""


def extract(path, pages_spec=None):
    tables = []
    with pdfplumber.open(path) as pdf:
        for page_no in parse_pages(pages_spec, len(pdf.pages)):
            page = pdf.pages[page_no - 1]
            for index, raw in enumerate(page.extract_tables()):
                rows = [[clean(c) for c in row] for row in raw if any(c for c in row)]
                if not rows:
                    continue
                header, body = rows[0], rows[1:]
                previous = tables[-1] if tables else None
                # A table that continues on the next page repeats (or omits) its header.
                if previous and previous["page"] == page_no - 1 and previous["header"] == header:
                    previous["rows"].extend(body)
                    continue
                tables.append({"page": page_no, "index": index, "header": header, "rows": body})
    return tables


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file")
    parser.add_argument("--format", choices=["json", "csv"], default="json")
    parser.add_argument("--pages")
    parser.add_argument("--out-dir")
    args = parser.parse_args()

    tables = extract(args.file, args.pages)
    if args.out_dir:
        os.makedirs(args.out_dir, exist_ok=True)
        for t in tables:
            name = os.path.join(args.out_dir, f"page{t['page']}_table{t['index']}.csv")
            with open(name, "w", newline="", encoding="utf-8") as fh:
                writer = csv.writer(fh)
                writer.writerow(t["header"])
                writer.writerows(t["rows"])
        print(f"wrote {len(tables)} tables to {args.out_dir}", file=sys.stderr)
    elif args.format == "csv":
        writer = csv.writer(sys.stdout)
        for t in tables:
            writer.writerow([f"# page {t['page']} table {t['index']}"])
            writer.writerow(t["header"])
            writer.writerows(t["rows"])
    else:
        json.dump(tables, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
