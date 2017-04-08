#!/usr/bin/env node

import { echo } from 'shelljs';
import { join } from 'path';
import { buildDir, exec, internDev } from './common';

const modes: { [name: string]: Function } = {
	all() {
		run('client');
		run('runner');
	},

	node() {
		run('client');
	},

	webdriver() {
		run('runner');
	}
};

const args = process.argv.slice(2);
let mode = 'node';
let config = 'tests/intern.js';

function run(runner: string) {
	let command = [ `intern-${runner}` ].concat(args);

	if (!args.some(arg => arg.indexOf('config=') === 0)) {
		command.push('config=' + join(buildDir, config));
	}

	echo('## Running tests');
	try {
		exec(`${command.join(' ')}`, { silent: false });
	}
	catch (error) {
		if (error.name === 'ExecError') {
			process.exitCode = 1;
		}
		else {
			throw error;
		}
	}
	echo('## Done testing');
}

if (internDev && internDev.testConfig) {
	config = internDev.testConfig;
}

if (args[0] in modes) {
	mode = args.shift();
}

modes[mode]();
