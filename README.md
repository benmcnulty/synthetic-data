# Lean Synthetic Data Generator

An experimental browser application for drafting a schema and generating small
synthetic datasets through an Ollama-compatible server. It uses plain HTML, CSS
and JavaScript, with no package installation or build step.

## What is implemented

- Field editor, record count and schema preview.
- Separate inference and optional embedding server/model settings.
- Model discovery, per-record generation, bounded retries and progress/event logs.
- Dataset table and SQL downloads, including an optional embedding export.
- Browser storage for endpoint settings, selected models, schema and dataset.

These are source-level capabilities, not a claim that every model, SQL consumer or
browser has been verified. Generated records require review; synthetic generation
does not establish anonymity, statistical fidelity or freedom from personal data.

## Run locally

Clone this repository and, with Python 3 installed, serve its directory:

```sh
git clone https://github.com/benmcnulty/synthetic-data.git
cd synthetic-data
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. Python only serves the static files; it is not an
application backend. No Python package, virtual environment or npm installation
is required. Stop the preview with Ctrl+C.

1. Run an Ollama-compatible server with an appropriate model installed.
2. Set the inference base URL, fetch its model list and choose an installed model.
3. Define fields and a small record count, then start generation.
4. Inspect records and failures before exporting SQL. Configure an embedding
   endpoint/model separately if you want the embedding export.

The browser calls `/api/tags`, `/api/chat` and, for embedding export,
`/api/embeddings` on the chosen server. That server must permit the preview's
browser origin. Opening the page directly with `file://` may encounter different
CORS restrictions. An HTTP endpoint from an HTTPS page may be blocked as mixed
content. This repository does not provide a proxy, authentication layer or CORS
configuration for the inference server.

## Source and data boundaries

[`index.html`](index.html) defines the panels, [`style.css`](style.css) their
presentation, and [`app.js`](app.js) the state, schema handling, generation and
exports. Generation uses non-streaming chat responses with per-record retries;
the UI updates as records finish.

There are no runtime environment variables or provider keys in the app. Prompts,
schema descriptions and embedding input are sent to the endpoints you choose.
Local endpoints can keep inference on your machines; a remote URL sends that
input to its operator. Settings and generated data persist in this browser's
local storage. Use fabricated, non-sensitive inputs and clear site storage when
you need to remove the local dataset.

## Verification and contributions

No automated test suite or CI workflow is committed. A manual check should cover
model discovery, a small dataset, invalid/unreachable endpoints, malformed model
output, refresh persistence and SQL/embedding downloads. This documentation
review did not run real inference or certify those flows.

Read [`AGENTS.md`](AGENTS.md) before proposing a focused change. Include the
browser/model tested and reproducible steps; preserve the simple static setup.
No license file or explicit source license is currently committed.
