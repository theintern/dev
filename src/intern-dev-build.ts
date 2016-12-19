#!/usr/bin/env node 

import { echo, sed } from 'shelljs';
import { join, dirname, basename } from 'path';
import { buildDir, copyAll, exec, getConfigs, getResources, tsconfig } from './common';
import { sync as glob } from 'glob';

// Copy resources first in case some of them are needed for builds
const resources = getResources();
Object.keys(resources).forEach(function (dest) {
	copyAll(resources[dest], join(buildDir, dest));
});

getConfigs().forEach(function (tsconfig) {
	echo(`## Compiling ${dirname(tsconfig)}`);
	exec(`tsc -p "${tsconfig}"`);
});

if (tsconfig.compilerOptions.inlineSources) {
	// If the project has inline sources in source maps set, set the path
	// to the source file to be a sibling of the compiled file
	echo('## Fixing source map paths');
	glob(join(buildDir, '**', '*.js.map'), { nodir: true }).forEach(function (filename) {
		sed('-i', /("sources":\[")(.*?)("\])/, `$1${basename(filename, '.js.map')}.ts$3`, filename);
	});
}

echo('## Done building');
