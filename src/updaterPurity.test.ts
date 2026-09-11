import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const appSource = readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

function skipString(source: string, quoteIndex: number): number {
  const quote = source[quoteIndex];
  let i = quoteIndex + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

// Skip a template literal, tracking `${...}` nesting so braces inside it are ignored.
function skipTemplate(source: string, openIndex: number): number {
  let i = openIndex + 1;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (depth === 0 && ch === '`') return i + 1;
    if (ch === '$' && source[i + 1] === '{') {
      depth += 1;
      i += 2;
      continue;
    }
    if (ch === '}' && depth > 0) {
      depth -= 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return i;
}

function findClosingBrace(source: string, openIndex: number): number {
  let depth = 1;
  let i = openIndex + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i = skipString(source, i);
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(source, i);
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return depth === 0 ? i - 1 : -1;
}

function updaterBodies(source: string): string[] {
  const bodies: string[] = [];
  const re = /updateState(?:Ref\.current)?\(\s*prev\s*=>\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const openBrace = source.indexOf('{', match.index);
    const closingBrace = findClosingBrace(source, openBrace);
    if (closingBrace > 0) {
      bodies.push(source.slice(openBrace + 1, closingBrace));
    }
  }
  return bodies;
}

describe('updateState updater purity (B5)', () => {
  it('never calls showToast inside an updateState updater', () => {
    const bodies = updaterBodies(appSource);
    expect(bodies.length).toBeGreaterThan(0);
    const offenders = bodies.filter(
      body => body.includes('showToast(') || body.includes('showToastRef.current(')
    );
    expect(offenders).toEqual([]);
  });
});