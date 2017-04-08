#!/usr/bin/env node

import { echo, rm } from 'shelljs';
import { dirname, join, relative } from 'path';
import { getConfigs, readJsonFile } from './common';

getConfigs().forEach(configFile => {
	const config = readJsonFile(configFile);
	let outDir = config.compilerOptions && config.compilerOptions.outDir;
	if (outDir) {
		outDir = relative(process.cwd(), join(dirname(configFile), outDir));
		echo(`## Removing ${outDir}`);
		rm('-rf', outDir);
	}
});

echo('## Done cleaning');
