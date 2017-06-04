#!/usr/bin/env node

import { rm } from 'shelljs';
import { dirname, join, relative } from 'path';
import { getConfigs, log, readJsonFile } from './common';

getConfigs().forEach(configFile => {
	const config = readJsonFile(configFile);
	let outDir = config.compilerOptions && config.compilerOptions.outDir;
	if (outDir) {
		outDir = relative(process.cwd(), join(dirname(configFile), outDir));
		log(`Removing ${outDir}`);
		rm('-rf', outDir);
	}
});

log('Done cleaning');
