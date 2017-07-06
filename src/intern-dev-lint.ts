#!/usr/bin/env node

import { glob, lint, log } from './common';
import { dirname } from 'path';
import { red } from 'chalk';

glob('**/tsconfig.json').forEach(function (tsconfig) {
	log(`Linting ${dirname(tsconfig)}`);

	try {
		lint(tsconfig);
	}
	catch (error) {
		if (error.name === 'ExecError') {
			log(red(error.stdout));
			process.exitCode = error.code;
		}
		else {
			throw error;
		}
	}
});

log('Done linting');
