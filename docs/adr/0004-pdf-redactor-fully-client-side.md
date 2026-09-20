# 0004. PDF Redactor runs entirely client-side, no backend

Status: Accepted

## Context

The general architecture allows any tool to add a Cloud Run backend and a
Firestore database if it needs one (see
[0006](0006-per-tool-backend-and-firestore-naming.md)). The PDF Redactor's
job is specifically to remove sensitive information from a document before
sharing it. Uploading that same sensitive document to a server to do the
redaction would undercut the tool's entire purpose, even if the server
never persisted it.

## Decision

The PDF Redactor has no backend and no Firestore database. Every step —
PDF parsing, page rasterization, redaction box drawing, and rebuilding the
output PDF — happens in the browser. The uploaded PDF never leaves the
user's machine.

## Consequences

- Strong privacy property: a redaction tool that never transmits the
  original document is easier to trust, including for the tool's own
  author.
- No server-side logic to build, deploy, or pay for — this tool is Hosting
  only.
- Rules out any future feature that needs server-side compute the browser
  can't do (e.g. large-scale OCR across many documents, batch processing
  triggered outside an open browser tab). If that's ever needed, it should
  be an explicit, visible opt-in ("upload to process on our server") rather
  than baked into the default flow.
