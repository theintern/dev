#!/usr/bin/env node 

import { echo } from 'shelljs';
import { join, dirname } from 'path';
import { buildDir, copyAll, exec, getResources, glob } from './common';

glob('**/tsconfig.json').forEach(function (tsconfig) {
	echo(`## Compiling ${dirname(tsconfig)}`);
	exec(`tsc -p "${tsconfig}"`);
});

const resources = getResources();

Object.keys(resources).forEach(function (dest) {
	copyAll(resources[dest], join(buildDir, dest));
});

echo('## Done building');
