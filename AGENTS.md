# Repository Guidelines

## Project Structure & Module Organization
Keep executable code inside `src/synthetic_data/`, broken down by domain (ingestion, augmentation, export). Shared utilities sit in `src/synthetic_data/common/`, and any experimental notebooks belong in `docs/notebooks/` so that the importable package stays clean. Tests mirror the package layout under `tests/` (e.g., `tests/augmentation/test_time_series.py`). Store lightweight sample assets in `datasets/sample/` and configuration presets in `configs/` as YAML or JSON. Automation or demo entry points should live in `scripts/`. A quick mnemonic tree:
```
synthetic-data/
├── src/synthetic_data/
├── tests/
├── datasets/sample/
├── configs/
└── scripts/
```

## Build, Test, and Development Commands
- `python3 -m venv .venv && source .venv/bin/activate`: create and activate a local workspace.
- `pip install -e .[dev]`: install the package plus dev extras so imports resolve in editable mode.
- `ruff check src tests`: run the fast lint pass before pushing.
- `pytest -q`: execute the unit suite; add `-k pattern` when iterating on a single area.
- `python scripts/generate_sample.py --config configs/default.yaml`: smoke-test the CLI pipeline against a known config.

## Coding Style & Naming Conventions
Use Python 3.11+ with full type hints; favor `pydantic` models or dataclasses for structured payloads. Format code with Black (88-character line width) and lint with Ruff; both tools are wired to respect the `pyproject.toml`. Modules and packages use lowercase_with_underscores, classes use CapWords, and async helpers append `_async` for clarity. Keep public APIs minimal—export through `src/synthetic_data/__init__.py` and guard experimental helpers with a leading underscore.

## Testing Guidelines
pytest is the canonical framework. Name files `test_<area>.py` and functions `test_<behavior>__<expectation>` to surface intent. When adding generators, include deterministic fixtures plus a property-based case (`@pytest.mark.parametrize` or Hypothesis) that stresses edge ranges. New features require companion tests under `tests/` and must keep coverage ≥90%; run `pytest --cov=synthetic_data --cov-report=term-missing`. Use `tests/data/` for static golden inputs so assets do not pollute `datasets/`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `chore:`) so release tooling can infer semantic versions. Each commit should bundle a single logical change touching code, tests, and docs together. PRs need: concise summary, linked issue or task ID, testing checklist (Paste `pytest` output), and screenshots or tables when data distributions change. Request review from a maintainer versed in the touched module and wait for CI + lint to pass before merging.
