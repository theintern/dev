#!/usr/bin/env node 

import { watch } from 'chokidar';
import { ChildProcess } from 'child_process';
import { echo, exec } from 'shelljs';
import { join } from 'path';
import { buildDir, copyAll, fixSourceMaps, getConfigs, getResources } from './common';
import { red } from 'chalk';

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

getConfigs().forEach(tsconfig => {
	echo(`## Starting tsc watcher for ${tsconfig}`);
	const child: ChildProcess = <ChildProcess>exec(`tsc --project "${tsconfig}" --watch`, {
		async: true,
		silent: true
	});

	child.stdout.on('data', (data: string) => {
		data.split('\n').filter(line => {
			return line !== '';
		}).forEach(line => {
			if (/\): error TS/.test(data)) {
				line = red(line);
			}
			else if (line.indexOf('Compilation complete') !== -1) {
				fixSourceMaps();
			}
			echo(line);
		});
	});
});
