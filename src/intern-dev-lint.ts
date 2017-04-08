#!/usr/bin/env node

import { echo, test } from 'shelljs';
import { glob, exec } from './common';
import { dirname, join, resolve } from 'path';

// Use the tslint file from this project if the project doesn't have one of its own
let configFile = test('-f', 'tslint.json') ? 'tslint.json' : resolve(join(__dirname, 'tslint.json'));

glob('**/tsconfig.json').forEach(function (tsconfig) {
	echo(`## Linting ${dirname(tsconfig)}`);
	try {
		exec(`tslint -c "${configFile}" --project "${tsconfig}"`);
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
