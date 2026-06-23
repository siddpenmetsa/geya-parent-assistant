# GEYA Parent Assistant

A responsive, production-ready chatbot for a youth sports organization website. It uses retrieval-augmented generation principles to answer only from indexed GEYA resources, with an optional OpenAI-powered answer generator when `OPENAI_API_KEY` is configured.

## Features

- Clean, accessible chat interface for parents, guardians, coaches, and volunteers
- Session conversation history
- Streaming responses with typing state
- Example prompt chips and suggested follow-up questions
- Sport and age/grade filters
- Quick links to matching resources
- Printable equipment checklist
- Admin knowledge-base refresh endpoint
- Strict fallback response when answers cannot be verified
- No runtime npm dependencies

## Quick Start

```bash
cd outputs/geya-parent-assistant
npm start
```

Open `http://localhost:3000`.

## Website Embed Preview

The recommended website placement is a minimized site-wide assistant that opens into a chat panel. It lets families ask questions while staying on the page they are already reading.

Preview it at:

```text
http://localhost:3000/embed-demo.html
```

For a production GEYA site, the assistant can be embedded as:

- A floating minimized widget on every program page
- A full standalone assistant page for families who prefer a dedicated help screen
- Both, with the widget linking to the full page when more space is useful

Recommended pitch option:

1. Add the minimized widget site-wide in the website footer/template so it appears on registration, soccer, baseball, and contact pages.
2. Keep `/parent-assistant` as a full-page version for families who want a larger help screen.
3. Start the widget minimized so it does not block GEYA's content, then let parents open it when they need help.

Prototype URLs:

- Full assistant: `http://localhost:3000/`
- Website placement preview: `http://localhost:3000/embed-demo.html`

## Optional OpenAI Mode

Set an API key to enable generation grounded in retrieved GEYA content:

```bash
$env:OPENAI_API_KEY="your_api_key"
npm start
```

Without an API key, the app uses a conservative extractive answer mode from the indexed resources.

## Knowledge Base

Add official GEYA content to:

- `data/pages/*.md`
- `data/docs/*.txt`
- `data/docs/*.md`
- `data/docs/*.json`

Then refresh the index:

```bash
npm run ingest
```

Or while the server is running:

```bash
curl -X POST http://localhost:3000/api/admin/refresh
```

For website ingestion, add URLs to `data/sources.json` and run `npm run ingest`. The server has a small built-in HTML text extractor; for PDFs and DOCX files, convert them to text or Markdown before placing them in `data/docs`.

## Safety Rule

If the assistant cannot verify an answer from indexed GEYA resources, it responds:

> I couldn't find that information in the available GEYA resources. Please check the official GEYA website or contact GEYA directly for confirmation.
