# Keep the map current with a coding agent

The map is a file in your repository. Ask your coding agent to refresh it when a change moves code between folders or changes imports. Commit the SVG with the code that changed.

Add this short rule to the instruction file your agent reads:

```text
When a change alters project folders or imports, run `npx --yes github:skipauthenticate/archcard .` from the repository root. Commit `docs/architecture.svg` with the code change. Do not edit the map by hand.
```

| Agent | Instruction file in your repository |
| --- | --- |
| Codex | `AGENTS.md` |
| Claude Code | `CLAUDE.md` |
| Cursor | `AGENTS.md` or a project rule in `.cursor/rules/` |
| GitHub Copilot | `AGENTS.md` or `.github/copilot-instructions.md` |
| Gemini CLI | `GEMINI.md` |
| OpenCode | `AGENTS.md` |

Create the file at the repository root if it does not exist. If it already exists, add the rule to it. You only need one instruction file for each agent you use. The rule asks the agent to run the command; it does not install a background process.

For a one-time update, you can simply ask: "Refresh the architecture map and include the SVG in this change."

The file locations above come from the [Codex](https://developers.openai.com/codex/guides/agents-md), [Claude Code](https://code.claude.com/docs/en/memory), [Cursor](https://docs.cursor.com/context/rules-for-ai), [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions), [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md), and [OpenCode](https://dev.opencode.ai/docs/rules/) docs.
