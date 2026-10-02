# Repository Guidelines

## Actual project structure

This repository is a static browser application, not a Python package.
`index.html` owns the interface, `style.css` the presentation, and `app.js` the
state, schema editor, Ollama requests, record processing and downloads. There is
no `src/synthetic_data/`, `pyproject.toml`, CLI or pytest suite in this checkout.

## Development and verification

Serve the repository with `python -m http.server 8000 --bind 127.0.0.1`, then open
`http://127.0.0.1:8000`. Python is only a static preview helper. There is no build
step or package installation. Refresh the browser after editing.

No automated test framework or coverage gate is configured. For behavior changes,
check model discovery, schema editing, a small generated dataset, failure/retry
handling, refresh persistence and downloads. Use fabricated inputs. State which
browser and inference endpoint/model you tested, and which checks remain unrun.
New deterministic tests should target actual record parsing/export behavior;
do not report imagined pytest or coverage results.

## Implementation conventions

Keep the existing plain JavaScript style and small, focused changes. Preserve the
schema UI, bounded retry behavior and separate inference/embedding configuration.
Use safe DOM text APIs for untrusted model output. Avoid a framework or dependency
change merely to edit documentation.

## Data and configuration

Browser requests go directly to the configured Ollama-compatible endpoints.
Endpoints, model names and generated records are untrusted. CORS and mixed-content
restrictions still apply. Do not put keys, private server addresses or personal
datasets in commits. Local storage persists settings, schema and generated data;
do not claim the app anonymizes sensitive inputs or guarantees dataset quality.

## Pull requests

Explain the observed problem, the resulting behavior and verification evidence.
Update the README for changes to setup, storage or exports. Keep provenance and
licensing intact; this checkout does not currently contain a license file.
