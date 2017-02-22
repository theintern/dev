#!/usr/bin/env node 

import browserify = require('browserify');
import { echo, mkdir, test } from 'shelljs';
import { buildDir, internDev } from './common';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';
import { red } from 'chalk';

echo('## Browserifying');

function bundle(files: string[], output: string) {
	files = files.map(file => join(buildDir, file));
	const b = browserify(files, { debug: true });
	return new Promise((resolve, reject) => {
		b.bundle((error, data) => {
			if (error) {
				reject(error);
			}
			else {
				resolve(data);
			}
		});
	}).then(data => {
		output = join(buildDir, output);
		const outputDir = dirname(output);
		if (!test('-d', outputDir)) {
			mkdir('-p', outputDir);
		}
		writeFileSync(output, data);
		echo(`## Created bundle at ${output}`);
	});
}

let exitCode = 0;
const bundles = internDev.browserify;

Promise.all(Object.keys(bundles).map(outFile => {
	return bundle(bundles[outFile], outFile);
})).catch (error => {
	echo(red(error));
	exitCode = 1;
}).then(() => {
	echo('## Done Browserifying');
	process.exit(exitCode);
});
