// Provenance gate (folder-layouts universal rule 4): every vendored or
// generated file names its upstream. Offline — reads files only; upstream drift
// is checked separately by design-principles/scripts/check-sync.sh.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Vendored principles: known list, plus anything else in docs/ that says it is vendored.
const VENDORED_DOCS = ['docs/decision-docs.md'];
const GENERATED_DIRS = ['web/src/components/ui'];
const GENERATED_FILES = ['web/src/lib/utils.js'];

// Generated files name their generator; hand-written look-alikes say so instead.
const PROVENANCE = /^\/\/ Provenance: (generated (from|by) |written locally)/;

function head(rel, lines = 8) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').slice(0, lines).join('\n');
}

describe('provenance headers', () => {
  const docs = fs.readdirSync(path.join(ROOT, 'docs'))
    .filter(f => f.endsWith('.md'))
    .map(f => `docs/${f}`)
    .filter(rel => VENDORED_DOCS.includes(rel) || /Vendored from/.test(head(rel)));

  for (const rel of docs) {
    it(`${rel} names its upstream path and source commit`, () => {
      const h = head(rel);
      assert.match(h, /Vendored from/);
      assert.match(h, /Upstream: \S+/);
      assert.match(h, /Source commit: [0-9a-f]{7,40}/);
    });
  }

  for (const dir of GENERATED_DIRS) {
    const files = fs.readdirSync(path.join(ROOT, dir)).filter(f => /\.(jsx?|tsx?)$/.test(f));
    it(`${dir} has generated files to check`, () => assert.ok(files.length > 0));
    for (const f of files) {
      it(`${dir}/${f} starts with a provenance header`, () => {
        assert.match(head(`${dir}/${f}`, 1), PROVENANCE);
      });
    }
  }

  for (const rel of GENERATED_FILES) {
    it(`${rel} starts with a provenance header`, () => assert.match(head(rel, 1), PROVENANCE));
  }
});
