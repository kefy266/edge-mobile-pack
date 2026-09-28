#!/usr/bin/env node
/**
 * build.js — bundles every src/ module into a real minified dist/.
 *
 *   node scripts/build.js           build + write dist/
 *   node scripts/build.js --check   verify dist/ is in sync (CI, no writes)
 *   node scripts/build.js --report  size report only
 *
 * Until now dist/*.min.js were byte-for-byte copies of src/, so the
 * ".min" name was untrue and nothing checked it. This script makes the
 * name true and makes drift a build failure instead of a surprise.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const JS_MODULES = [
  'edge-offline.js',
  'edge-mobile.js',
  'edge-turn-accelerator.js',
  'edge-layout.js',
  'edge-mobile-pack.js'
];

const CSS_FILES = ['edge-mobile-pack.css'];

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const REPORT_ONLY = args.includes('--report');

function esbuildAvailable() {
  try {
    execFileSync('npx', ['--no-install', 'esbuild', '--version'], {
      cwd: ROOT,
      stdio: 'ignore'
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Whitespace/comment stripper used when esbuild is not installed. */
function stripJs(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  let prevMeaningful = '';

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    // Line comment
    if (c === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // String literal — copy verbatim, honouring escapes
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (code[i] === '\\') {
          out += code[i] + (code[i + 1] || '');
          i += 2;
          continue;
        }
        out += code[i];
        if (code[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      prevMeaningful = quote;
      continue;
    }
    // Regex literal — only when it can legally appear here
    if (c === '/' && !'})];,'.includes(prevMeaningful)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '[') inClass = true;
        else if (code[j] === ']') inClass = false;
        else if (code[j] === '/' && !inClass) { closed = true; break; }
        else if (code[j] === '\n') break;
        j++;
      }
      if (closed) {
        out += code.slice(i, j + 1);
        i = j + 1;
        prevMeaningful = '/';
        continue;
      }
    }

    // Collapse runs of whitespace
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(code[j])) j++;
      const before = out[out.length - 1] || '';
      const after = code[j] || '';
      if (/[A-Za-z0-9_$]/.test(before) && /[A-Za-z0-9_$]/.test(after)) {
        out += ' ';
      }
      i = j;
      continue;
    }

    out += c;
    prevMeaningful = c;
    i++;
  }
  return out.trim() + '\n';
}

function stripCss(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .trim() + '\n';
}

function buildOne(file, useEsbuild) {
  const srcPath = path.join(SRC, file);
  const raw = fs.readFileSync(srcPath, 'utf8');
  const isCss = file.endsWith('.css');
  const outName = file.replace(/\.js$/, '.min.js').replace(/\.css$/, '.min.css');
  const outPath = path.join(DIST, outName);

  let min;
  if (useEsbuild) {
    min = execFileSync(
      'npx',
      ['--no-install', 'esbuild', srcPath, '--minify', '--target=es2018', `--outfile=${outPath}`],
      { cwd: ROOT, encoding: 'utf8' }
    );
    min = fs.readFileSync(outPath, 'utf8');
  } else {
    min = isCss ? stripCss(raw) : stripJs(raw);
  }

  return { file, outName, outPath, rawSize: Buffer.byteLength(raw), minSize: Buffer.byteLength(min), min };
}

function main() {
  const files = [...JS_MODULES, ...CSS_FILES];

  if (REPORT_ONLY) {
    console.log('Edge Mobile Pack — bundle sizes\n');
    for (const f of files) {
      const outName = f.replace(/\.js$/, '.min.js').replace(/\.css$/, '.min.css');
      const outPath = path.join(DIST, outName);
      const raw = fs.statSync(path.join(SRC, f)).size;
      let min = 0;
      if (fs.existsSync(outPath)) min = fs.statSync(outPath).size;
      const pct = min ? ((min / raw) * 100).toFixed(1) : '0.0';
      console.log(
        `  ${f.padEnd(28)} ${String(raw).padStart(7)} B  ->  ${String(min).padStart(7)} B  (${pct}%)`
      );
    }
    return;
  }

  const useEsbuild = esbuildAvailable();
  if (!useEsbuild) {
    console.warn('! esbuild not installed, using built-in stripper (run: npm i)');
  }

  const results = files.map((f) => buildOne(f, useEsbuild));

  if (CHECK) {
    let drift = 0;
    for (const r of results) {
      if (!fs.existsSync(r.outPath)) {
        console.error(`MISSING  dist/${r.outName} — run: npm run build`);
        drift++;
        continue;
      }
      const onDisk = fs.readFileSync(r.outPath, 'utf8');
      if (onDisk !== r.min) {
        console.error(
          `STALE    dist/${r.outName} differs from a fresh build — run: npm run build`
        );
        drift++;
      } else {
        console.log(`OK       dist/${r.outName}  (${r.minSize} B)`);
      }
    }
    if (drift > 0) {
      console.error(`\n${drift} bundle(s) out of sync with src/.`);
      process.exit(1);
    }
    console.log('\nAll bundles in sync with src/.');
    return;
  }

  fs.mkdirSync(DIST, { recursive: true });
  console.log('Edge Mobile Pack — build\n');
  for (const r of results) {
    if (!useEsbuild) {
      fs.writeFileSync(r.outPath, r.min);
    }
    const pct = ((r.minSize / r.rawSize) * 100).toFixed(1);
    console.log(
      `  ${r.file.padEnd(28)} ${String(r.rawSize).padStart(7)} B  ->  ${String(r.minSize).padStart(7)} B  (${pct}%)`
    );
  }
  console.log('\nWrote dist/.');
}

main();
