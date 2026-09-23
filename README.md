# Archcard

**A map of a codebase that belongs in its README.**

Archcard reads a repository and draws its main folders and imports as an SVG image. Add the image to a README so a new reader can see how the code is organized. The tool runs locally. It sends no source files to a model or hosted service.

![Archcard map of LMStash, with source folders and import links](docs/architecture.svg)

This map is from [LMStash](https://github.com/skipauthenticate/lmstash).

## Try it

You need Node.js 20 or later, npm, and Git. Run this from the repository you want to map:

```bash
npx --yes github:skipauthenticate/archcard .
```

Archcard writes `docs/architecture.svg` and prints the line to add to your README. You can also give it a public GitHub URL:

```bash
npx --yes github:skipauthenticate/archcard https://github.com/skipauthenticate/docky --out docky.svg
```

Open `docky.svg` to see the result. Commit the SVG and add the printed image link to your README. Archcard does not edit your README or make a commit.

Use `--title LMStash` when you want to keep the exact capitalization of a project name.

## What the map shows

- Source folders are grouped into project areas. Each area shows key folders and file counts.
- A separate list shows which folders import from others and how many source files do so.
- Large repositories show the main areas and state how many folders and links are left out.

The map reflects the files at the time you generate it. It does not guess at runtime traffic, cloud services, or hidden dependencies.

## Keep it current

If you work with a coding agent, give it one rule: refresh the map after a change to folders or imports, then commit the SVG with the code. [Setup for Codex, Claude Code, Cursor, Copilot, Gemini CLI, and OpenCode](docs/agents.md).

## Put it in your README

Copy this line after you commit `docs/architecture.svg`:

```md
[![Architecture map](docs/architecture.svg)](https://github.com/skipauthenticate/archcard)
```

The image links back to Archcard. The SVG also has a small credit in its footer.

## How it works

[![Archcard source map with detected imports](docs/archcard.svg)](https://github.com/skipauthenticate/archcard)

The analyzer scans common source file types and groups them by directory. It follows recognized local imports in JavaScript, TypeScript, Python, and Rust. It skips dependencies and build output. The renderer writes a self-contained SVG, so the image works in a GitHub README without a separate server.

The tool reads files from your local checkout. For a public GitHub URL, it first clones the repository to a temporary folder. It does not need an account or API key. A private repository must be available as a local checkout.

Archcard does not trace runtime calls or every language's import syntax. If a line is missing, check the source before you trust the picture.

## Other tools

[GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) makes interactive diagrams from GitHub repositories. [Arkit](https://github.com/dyatko/arkit) draws SVG diagrams for JavaScript and TypeScript. [RepoArch](https://github.com/dsk-dev-ai/repoarch) makes local Mermaid diagrams and supports coding agents. Archcard writes a static SVG for a README, using folders and imports it finds in the source.

## Project layout

```text
bin/archcard.js  Read arguments, clone public URLs, write the image
src/analyze.js   Scan source files and find local imports
src/render.js    Draw the SVG
test/            Small fixtures for parsing and safe SVG output
docs/agents.md   Agent instructions for keeping a map current
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Archcard is MIT licensed.
