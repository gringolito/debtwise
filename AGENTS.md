# Project conventions

## Git conventions

All commits must be signed and signed-off. Use `git commit -S -s`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI).

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Backlog

The backlog skills read the GitHub Project and label vocabulary from
[`docs/agents/backlog.md`](docs/agents/backlog.md).

## Coding standards

Every change follows [`CODING_STANDARDS.md`](CODING_STANDARDS.md) and the ADRs in `docs/adr/`.

## Task runner

This project uses [mise](https://mise.jdx.dev/) for running tasks. Check `mise.toml` for available
tasks (`mise tasks`). If you find yourself running a common task ad-hoc repeatedly, add it to
`mise.toml` instead of relying on manual commands.

## Code comments

This project values good, readable, and easy-to-understand code over excessive comments. Do not add
comments for obvious things, only add one if it is truly worth it and the intent or mechanism cannot
be figured out or inferred directly by reading the code. Not every update is worth one. If you
decide to include a code comment, keep it brief, clean and technical.
