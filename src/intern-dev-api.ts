#!/usr/bin/env node

// Typedoc 0.15 assumes some of the handlebars types will be available globally
/// <reference types="handlebars" />

// Generate API doc data for a project

import { Application, Reflection, TSConfigReader } from 'typedoc';
import { isAbsolute, join, relative } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { sync as resolve } from 'resolve';
import chalk from 'chalk';
import { log } from './common';

// Use TypeDoc to generate an API description
log('Generating API data');

const entryPoints = process.argv.slice(2);
if (entryPoints.length === 0) {
  entryPoints.push('./src/index.ts');
}

const app = new Application();
app.options.addReader(new TSConfigReader());
app.bootstrap({
  logger: 'none',
  excludePrivate: true,
});

const project = app.convert(entryPoints);

if (!project) {
  log(chalk.red('The project could not be analyzed.'));
  const typedoc = require.resolve('typedoc');
  const tsc = relative(
    process.cwd(),
    resolve('typescript/bin/tsc', { basedir: typedoc })
  );
  log(chalk.red(`Try building with ${tsc} to see what's wrong.`));
  process.exit(1);
}

const cwd = process.cwd();

log('Scrubbing file paths');
scrubPaths(project);

log('Normalizing line endings');
normalizeLineEndings(project);

const json = JSON.stringify(
  app.serializer.projectToObject(project),
  null,
  '\t'
);

if (!existsSync('docs')) {
  log('Making docs directory');
  mkdirSync('docs');
}

const outFile = join('docs', 'api.json');
writeFileSync(outFile, json);
log(`Wrote API data to ${outFile}`);

// Recursively walk an object, normalizing any line endings in strings
function normalizeLineEndings(reflection: any) {
  walk(
    reflection,
    '__lenormalized__',
    (_, value) => typeof value === 'string' && /\r\n/.test(value),
    (value) => value.replace(/\r\n/g, '\n')
  );
}

// Recursively walk an object, relativizing any paths
function scrubPaths(reflection: any) {
  walk(
    reflection,
    '__scrubbed__',
    (key, value) =>
      typeof value === 'string' &&
      (key === 'originalName' || key === 'fileName' || key === 'name'),
    scrubPath
  );
}

// Relativize a path, or return the input if it's not an absolute path
function scrubPath(value: string) {
  if (/".*"/.test(value)) {
    const testValue = value.replace(/^"/, '').replace(/"$/, '');
    if (isAbsolute(testValue)) {
      const newPath = `"${relative(cwd, testValue)}"`;
      return newPath.replace(/\\/g, '/');
    }
  } else if (isAbsolute(value)) {
    const newPath = relative(cwd, value);
    return newPath.replace(/\\/g, '/');
  }
  return value;
}

// Walk a project reflection, modifying values as necessary
function walk(
  reflection: any,
  sentinel: string,
  test: (key: string, value: unknown) => boolean,
  modify: (value: any) => any
) {
  if (reflection[sentinel]) {
    return;
  }

  reflection[sentinel] = true;

  if (Array.isArray(reflection)) {
    for (const item of reflection) {
      if (typeof item === 'object') {
        walk(item, sentinel, test, modify);
      }
    }
  } else if (typeof reflection === 'object') {
    const keys = Object.keys(reflection) as (keyof Reflection)[];
    for (const key of keys) {
      const value = reflection[key];
      if (value == null) {
        continue;
      }

      if (test(key, value)) {
        reflection[key] = modify(value);
      } else if (typeof value === 'object') {
        walk(value as Reflection, sentinel, test, modify);
      }
    }
  }
}
