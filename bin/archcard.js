#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeRepo } from '../src/analyze.js';
import { renderSvg } from '../src/render.js';
import { renderReport } from '../src/report.js';

const help = `Archcard — turn a repository into a README-ready repository map

Usage:
  archcard [path-or-github-url] [--out docs/architecture.svg] [--title "Project Name"]

Examples:
  archcard .
  archcard https://github.com/owner/repo --out docs/architecture.svg
`;

function githubUrl(input) {
  if (!/^https?:\/\//i.test(input)) return null;
  const url = new URL(input);
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' ||
      url.username || url.password || url.search || url.hash || !match) {
    throw new Error('Use a public GitHub repository URL such as https://github.com/owner/repo.');
  }
  return `https://github.com/${match[1]}/${match[2]}.git`;
}

function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  if (args.includes('--version')) {
    process.stdout.write('0.1.0\n');
    return;
  }

  let input = '.';
  let output;
  let title;
  let hasInput = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--out') {
      output = args[++index];
      if (!output || output.startsWith('--')) throw new Error('--out needs a file path.');
    } else if (argument === '--title') {
      title = args[++index];
      if (!title || title.startsWith('--')) throw new Error('--title needs a project name.');
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (hasInput) {
      throw new Error('Give one repository path or GitHub URL.');
    } else {
      input = argument;
      hasInput = true;
    }
  }

  const cloneUrl = githubUrl(input);
  const temporary = cloneUrl ? fs.mkdtempSync(path.join(os.tmpdir(), 'archcard-')) : null;
  try {
    let root = input;
    if (cloneUrl) {
      root = path.join(temporary, 'repo');
      const clone = spawnSync('git', ['clone', '--quiet', '--depth', '1', cloneUrl, root], {
        encoding: 'utf8', timeout: 120_000,
      });
      if (clone.error || clone.status !== 0) throw new Error(`Git clone failed: ${(clone.stderr || clone.error?.message || 'unknown error').trim()}`);
    }
    const graph = analyzeRepo(root);
    if (cloneUrl) graph.name = path.posix.basename(new URL(cloneUrl).pathname, '.git');
    if (title) graph.name = title;
    const destination = output
      ? path.resolve(output)
      : path.resolve(cloneUrl ? '.' : root, 'docs/architecture.svg');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const report = destination.replace(/\.svg$/i, '') + '-map.md';
    const sourceBase = cloneUrl
      ? cloneUrl.slice(0, -4) + '/blob/' + spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() + '/'
      : (path.relative(path.dirname(report), path.resolve(root)).split(path.sep).join('/') || '.') + '/';
    fs.writeFileSync(destination, renderSvg(graph));
    fs.writeFileSync(report, renderReport(graph, { sourceBase, image: path.basename(destination) }));
    const projectRelative = cloneUrl ? '..' : path.relative(path.resolve(root), destination);
    const shareRoot = projectRelative === '..' || projectRelative.startsWith(`..${path.sep}`)
      ? process.cwd() : path.resolve(root);
    const shown = path.isAbsolute(output ?? '')
      ? destination : path.relative(process.cwd(), destination).split(path.sep).join('/');
    const imagePath = path.relative(shareRoot, destination).split(path.sep).join('/');
    const shownReport = path.relative(process.cwd(), report).split(path.sep).join('/');
    process.stdout.write(`Wrote ${shown} and ${shownReport} from ${graph.totalFiles} source files.\n\n`);
    if (imagePath !== '..' && !imagePath.startsWith('../')) {
      const reportPath = path.relative(shareRoot, report).split(path.sep).join('/');
      process.stdout.write(`Add this to your README:\n[![Repository map](${encodeURI(imagePath)})](${encodeURI(reportPath)})\n[Made with Archcard](https://github.com/skipauthenticate/archcard)\n`);
    }
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`archcard: ${error.message}\n`);
  process.exitCode = 1;
}
