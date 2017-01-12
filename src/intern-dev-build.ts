#!/usr/bin/env node 

import { echo} from 'shelljs';
import { join, dirname } from 'path';
import { buildDir, copyAll, exec, fixSourceMaps, getConfigs, getResources, tsconfig } from './common';

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
	fixSourceMaps();
}

echo('## Done building');
