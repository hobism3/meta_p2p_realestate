#!/usr/bin/env python3
"""Offline, explicitly user-authorized PDF text-layer extraction.

This is a local developer convenience tool, not OCR or official title checking.
No uploaded bytes, passwords, network calls, owner names, or text reach stdout.

Install separately on a trusted machine: python -m pip install pypdf
Example: python tools/registry_pdf_text_local.py sample.pdf --output /tmp/sample-title.txt --allow-sensitive-local-output
The output may contain owner/creditor PII: never commit or share it. Delete it after review.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import sys

MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 120_000
MAX_PAGES = 30


def refuse_git_destination(path: pathlib.Path) -> bool:
    # Refuse plaintext sensitive output anywhere inside a Git checkout.
    return any((part / ".git").exists() for part in [path.parent, *path.parents])


def extract(pdf: pathlib.Path, output: pathlib.Path, acknowledged: bool) -> tuple[int, int]:
    if not acknowledged:
        raise ValueError("Use --allow-sensitive-local-output after choosing a private, temporary output path.")
    if not pdf.is_file() or pdf.stat().st_size > MAX_PDF_BYTES or pdf.stat().st_size < 100:
        raise ValueError("Expected a local PDF file between 100 bytes and 8 MiB.")
    with pdf.open("rb") as handle:
        if handle.read(5) != b"%PDF-":
            raise ValueError("Unrecognized PDF signature.")
    out = output.expanduser().resolve(strict=False)
    if out.suffix.lower() != ".txt" or refuse_git_destination(out):
        raise ValueError("Output must be a .txt outside Git checkouts; never commit raw PDF text.")
    if out.exists():
        raise ValueError("Refusing to overwrite an existing extracted file.")
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Install the offline package first: python -m pip install pypdf") from exc
    reader = PdfReader(str(pdf), strict=True)
    if reader.is_encrypted:
        raise ValueError("Encrypted documents are not supported.")
    page_count = len(reader.pages)
    if page_count < 1 or page_count > MAX_PAGES:
        raise ValueError("PDF page count exceeds the 30-page offline limit.")
    pages: list[str] = []
    for i, page in enumerate(reader.pages, start=1):
        body = page.extract_text(extraction_mode="plain") or ""
        if "\x00" in body:
            raise ValueError("Unsupported extracted text encoding.")
        pages.append(f"[PAGE {i}]\n{body}")
    result = "\n".join(pages)
    if len(result) > MAX_TEXT_CHARS:
        raise ValueError("Text exceeds the 120000-character local parser limit.")
    if len(result.strip()) < 30:
        raise ValueError("No useful text layer found. Scanned-image PDFs need a separate local OCR pipeline.")
    out.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(out), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(result)
    except BaseException:
        out.unlink(missing_ok=True)
        raise
    return page_count, len(result)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract local PDF text without upload/LLM or terminal PII.")
    parser.add_argument("pdf", help="Local PDF path")
    parser.add_argument("--output", required=True, help="Private .txt path outside Git worktrees; will not overwrite")
    parser.add_argument("--allow-sensitive-local-output", action="store_true", help="I accept that output may contain PII.")
    args = parser.parse_args()
    try:
        pages, chars = extract(pathlib.Path(args.pdf), pathlib.Path(args.output), args.allow_sensitive_local_output)
    except Exception as exc:
        print(f"Local extraction failed: {exc}", file=sys.stderr)
        return 2
    print(f"Local text-layer extraction completed: {pages} page(s), {chars} character(s).")
    print("Output may contain private information. Paste only into the local /registry/extract page and securely delete the file.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
