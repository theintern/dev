#!/usr/bin/env node 

import { watch } from 'chokidar';
import { spawn } from 'child_process';
import { echo } from 'shelljs';
import { dirname, join } from 'path';
import { buildDir, copyAll, fixSourceMaps, getConfigs, getResources } from './common';
import { red } from 'chalk';
import { readFileSync } from 'fs';

function createCopier(dest: string) {
	let outDir = join(buildDir, dest);
	return function (filename: string) {
		copyAll([ filename ], outDir);
	};
}

// Copy resources first in case some of them are needed for builds
const resources = getResources();

Object.keys(resources).forEach(function (dest) {
	const scheduleCopy = createCopier(dest);
	const watcher = watch(resources[dest]).on('ready', function () {
		echo(`## Watching files in ${dest}`);
		watcher.on('add', scheduleCopy);
		watcher.on('change', scheduleCopy);
		watcher.on('unlink', scheduleCopy);
	}).on('error', function (error) {
		echo('Watcher error:', error);
	});
});

getConfigs().forEach(tsconfigFile => {
	const projectDir = dirname(tsconfigFile);
	echo(`## Starting tsc watcher for ${projectDir}`);
	const child = spawn('tsc', ['--watch', '--project', projectDir]);

	const tsconfig = JSON.parse(readFileSync(tsconfigFile, { encoding: 'utf8' }));

	child.stdout.on('data', (data: Buffer) => {
		data.toString('utf8').split('\n').filter(line => {
			return line !== '';
		}).forEach(line => {
			if (/\berror TS\d+:/.test(line)) {
				line = red(line);
			}
			else if (line.indexOf('Compilation complete') !== -1) {
				if (tsconfig.compilerOptions.inlineSources) {
					echo(`## Fixing source maps`);
					fixSourceMaps();
				}
			}
			echo(line);
		});
	});
});
