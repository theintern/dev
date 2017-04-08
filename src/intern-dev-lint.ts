#!/usr/bin/env node

import { echo } from 'shelljs';
import { glob, lint } from './common';
import { dirname } from 'path';

glob('**/tsconfig.json').forEach(function (tsconfig) {
	echo(`## Linting ${dirname(tsconfig)}`);

	try {
		lint(tsconfig);
	}
	catch (error) {
		if (error.name === 'ExecError') {
			echo(error.stdout);
			process.exitCode = error.code;
		}
		else {
			throw error;
		}
	}
});

echo('## Done linting');
