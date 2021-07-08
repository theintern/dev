#!/usr/bin/env node

import { lint, log } from './common';
import chalk from 'chalk';

log('Linting');

try {
  lint();
} catch (error) {
  if (error.name === 'ExecError') {
    log(chalk.red(error.stdout));
    process.exitCode = error.code;
  } else {
    throw error;
  }
}

log('Done linting');
