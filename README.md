# Lean Synthetic Data Generator

Browser-only tool for drafting JSON schemas, connecting to a local Ollama server, and generating small synthetic datasets without sending information to third-party services.

## Highlights
- Zero build tooling: open `index.html` and start editing.
- Inline schema builder with add/remove field controls, record-count selector, and live preview.
- Connection panel to store the Ollama base URL, fetch available models, and select defaults.
- Generation dashboard that shows phase/status counters, event logs, and a rendered dataset table.

## Usage
1. Serve the folder or open `index.html` directly (Chrome/Safari recommended).
2. Set the Ollama base URL and click **Fetch Model List**.
3. Define your schema fields and desired record count.
4. Click **Start Generation** to stream records; watch the event log for progress.

## Next Steps Before Publishing
- Add error handling + fallbacks for browsers that block cross-origin requests.
- Document the Ollama prompt format and how data is chunked.
- Consider extracting the generation logic into a separate `app.js` module for easier testing.
