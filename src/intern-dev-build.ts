#!/usr/bin/env node 

import { echo } from 'shelljs';
import { join, dirname } from 'path';
import { buildDir, copyAll, exec, getConfigs, getResources } from './common';

// Copy resources first in case some of them are needed for builds
const resources = getResources();
Object.keys(resources).forEach(function (dest) {
	copyAll(resources[dest], join(buildDir, dest));
});

getConfigs().forEach(function (tsconfig) {
	echo(`## Compiling ${dirname(tsconfig)}`);
	exec(`tsc -p "${tsconfig}"`);
});

echo('## Done building');
