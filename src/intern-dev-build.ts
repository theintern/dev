#!/usr/bin/env node

// Build, and optionally continue watching and rebuilding a project

// Use native tsc, webpack, and stylus watchers.
// Use chokidar to create file watchers to copy changed files.
// When the script is first run, do a complete build. If a 'watch' argument is provided, start watchers.

import {
  ChildProcess,
  spawn,
  spawnSync,
  SpawnSyncReturns,
} from 'child_process';
import { watch, FSWatcher } from 'chokidar';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { mkdir, rm } from 'shelljs';
import { sync as glob } from 'glob';
import {
  buildDir,
  copyAll,
  copyFile,
  getConfigs,
  internDev,
  lint,
  log,
} from './common';

const args = process.argv.slice(2);
const watchMode = args[0] === 'watch';

// -----------------------------------------------------------------
// Stylus
// -----------------------------------------------------------------
if (internDev.stylus) {
  try {
    const stylus = require.resolve('stylus/bin/stylus');
    if (watchMode) {
      const proc = spawn('node', [stylus, ...internDev.stylus, '--watch']);
      watchProcess('stylus', proc);
    } else {
      const proc = spawnSync('node', [stylus, ...internDev.stylus]);
      logProcess('stylus', proc);
    }
  } catch (error) {
    handleError(error);
  }
}

// -----------------------------------------------------------------
// Resources
// -----------------------------------------------------------------
const buildDst = join(buildDir, 'src');
const resources = internDev.resources || {};
resources[buildDst] = (resources[buildDst] || []).concat([
  'package.json',
  'eslint.config.js',
  'README*',
  'LICENSE*',
]);
try {
  Object.keys(resources).forEach((dest) => {
    copyAll(resources[dest], dest);
    if (watchMode) {
      createFileWatcher(resources[dest], dest);
    }
  });
} catch (error) {
  handleError(error);
}

// -----------------------------------------------------------------
// Typescript
// -----------------------------------------------------------------
try {
  getConfigs().forEach((tsconfig) => {
    log(`Linting ${dirname(tsconfig)}`);
    lint();

    log(`Compiling ${dirname(tsconfig)}`);
    const tag = `tsc:${dirname(tsconfig)}`;
    const tsc = require.resolve('typescript/bin/tsc');
    if (watchMode) {
      const proc = spawn('node', [tsc, '-p', tsconfig, '--watch']);
      watchProcess(tag, proc, /\berror TS\d+:/);
    } else {
      const proc = spawnSync('node', [tsc, '-p', tsconfig]);
      logProcess(tag, proc, /\berror TS\d+:/);
    }
  });
} catch (error) {
  handleError(error);
}

// -----------------------------------------------------------------
// Webpack
// -----------------------------------------------------------------
const webpackConfig = glob(internDev.webpack || 'webpack.config.*')[0];
if (webpackConfig) {
  try {
    let webpack: string;
    try {
      webpack = require.resolve('webpack-cli/bin/webpack');
    } catch (error) {
      webpack = require.resolve('webpack/bin/webpack');
    }

    if (watchMode) {
      const proc = spawn('node', [
        webpack,
        '--config',
        webpackConfig,
        '--watch',
      ]);
      watchProcess('webpack', proc, /^ERROR\b/);
    } else {
      const proc = spawnSync('node', [webpack, '--config', webpackConfig]);
      logProcess('webpack', proc, /^ERROR\b/);
    }
  } catch (error) {
    handleError(error);
  }
}

log('Done building');

/**
 * Return a file watcher that will copy changed files to an output dir
 */
function createFileWatcher(
  patterns: string[],
  dstDir: string | string[]
): FSWatcher {
  if (!Array.isArray(dstDir)) {
    dstDir = [dstDir];
  }

  dstDir.forEach((dir) => mkdir('-p', dirname(dir)));

  const watcher = watch(patterns)
    .on('ready', () => {
      log(`Watching files for ${patterns[0]} => ${JSON.stringify(dstDir)}`);
      watcher.on('add', (file: string) => copy(file, dstDir));
      watcher.on('change', (file: string) => copy(file, dstDir));
      watcher.on('unlink', (file: string) => remove(file, dstDir));
    })
    .on('error', (error: Error) => {
      log(chalk.red('!!'), 'Watcher error:', error);
    });

  return watcher;
}

function copy(file: string, dstDir: string | string[]) {
  if (!Array.isArray(dstDir)) {
    dstDir = [dstDir];
  }
  dstDir.forEach((dir) => {
    copyFile(file, dir);
    log(`Copied ${file} -> ${dir}`);
  });
}

function handleError(
  error: Error & { stderr?: string; stdout?: string; code: number }
) {
  if (error.name === 'ExecError') {
    log(chalk.red(error.stderr || error.stdout));
    process.exit(error.code);
  } else {
    throw error;
  }
}

function logProcess(
  name: string,
  proc: SpawnSyncReturns<Buffer | string>,
  errorTest?: RegExp
) {
  if (proc.status) {
    logProcessOutput(name, proc.stdout || proc.stderr, /.*/);
    log(chalk.red(`Error running ${name}, exiting...`));
    process.exit(1);
  } else {
    logProcessOutput(name, proc.stdout, errorTest);
  }
}

function logProcessOutput(
  name: string,
  text: string | Buffer,
  errorTest?: RegExp
) {
  if (!text) {
    return;
  }

  if (typeof text !== 'string') {
    text = text.toString('utf8');
  }
  let lines = text
    .split('\n')
    .filter((line) => !/^\s*$/.test(line))
    .filter((line) => !/^Child$/.test(line))
    .map((line) => line.replace(/\s+$/, ''))
    // Strip off timestamps
    .map((line) =>
      /^\d\d:\d\d:\d\d \w\w -/.test(line)
        ? line.slice(line.indexOf('-') + 2)
        : line
    );
  if (errorTest) {
    lines = lines.map((line) =>
      errorTest.test(line) ? chalk.red(line) : line
    );
  }
  lines.forEach((line) => {
    log(`[${name}] ${line}`);
  });
}

function remove(file: string, dstDir: string | string[]) {
  if (!Array.isArray(dstDir)) {
    dstDir = [dstDir];
  }
  dstDir.forEach((dir) => {
    try {
      const path = join(dir, file);
      rm(path);
      log(`Removed ${path}`);
    } catch (error) {
      // ignore
    }
  });
}

function watchProcess(name: string, proc: ChildProcess, errorTest?: RegExp) {
  proc.stdout?.on('data', (data: Buffer) => {
    logProcessOutput(name, data.toString('utf8'), errorTest);
  });
  proc.stderr?.on('data', (data: Buffer) => {
    logProcessOutput(name, data.toString('utf8'), errorTest);
  });
  proc.on('error', () => {
    process.exit(1);
  });
}
