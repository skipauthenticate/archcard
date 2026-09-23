# Archcard

**A clean picture of a codebase for its README.**

Archcard scans a repository and draws its source areas, folders, and selected files. It writes an SVG image for the README and a page that links to every scanned file. It runs locally. It sends no source files to a model or hosted service.

[![LMStash repository map](docs/architecture.svg)](docs/architecture-map.md)

This example uses [LMStash](https://github.com/skipauthenticate/lmstash). Open the image to browse its full file list.

## Try it

You need Node.js 20 or later, npm, and Git. Run this command from the repository you want to map:

```bash
npx --yes github:skipauthenticate/archcard .
```

Archcard writes `docs/architecture.svg` and `docs/architecture-map.md`. It prints the lines to add to your README. You can also give it a public GitHub URL:

```bash
npx --yes github:skipauthenticate/archcard https://github.com/skipauthenticate/docky --out docky.svg
```

This writes `docky.svg` and `docky-map.md`. Commit both files and add the printed image link to your README. Archcard does not edit the README or make a commit.

Use `--title LMStash` to keep the exact capitalization of a project name.

## What the map shows

- The image groups source folders into areas. It shows file counts and selected files in each area.
- The linked page lists every scanned source file. Each file name opens the source.
- Large repositories keep the image readable. The linked page holds the complete file list.

The map reflects the files at the time you generate it. It does not guess how the program runs.

## Keep it current

If you work with a coding agent, ask it to refresh the map when source files or folders change. Commit both map files with the code. [Setup for Codex, Claude Code, Cursor, Copilot, Gemini CLI, and OpenCode](docs/agents.md).

## Put it in your README

Copy these lines after you commit both files:

```md
[![Repository map](docs/architecture.svg)](docs/architecture-map.md)
[Made with Archcard](https://github.com/skipauthenticate/archcard)
```

The image opens the full file list. The credit links back to Archcard.

## How it works

[![Archcard repository map](docs/archcard.svg)](docs/archcard-map.md)

The scanner finds common source file types and groups them by directory. It skips dependencies and build output. The renderer writes a self-contained SVG, so the image works in a GitHub README without a server.

The tool reads files from your local checkout. For a public GitHub URL, it first clones the repository to a temporary folder. It needs no account or API key. Give it a local checkout to map a private repository.

## Other tools

[GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) and [CodeBoarding](https://github.com/CodeBoarding/CodeBoarding) offer interactive views. [RepoArch](https://github.com/dsk-dev-ai/repoarch) makes Mermaid and HTML diagrams. [Squinch](https://github.com/jquatier/squinch) draws diagrams from a model that a person or agent writes. Archcard makes a small README image from the files and folders it finds.

## Project layout

```text
bin/archcard.js  Read arguments, clone public URLs, write both maps
src/analyze.js   Find source files and group them by directory
src/render.js    Draw the SVG
src/report.js    Write the linked file list
test/            Check scanning, safe SVG output, and the CLI
docs/agents.md   Agent instructions for keeping a map current
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Archcard is MIT licensed.
