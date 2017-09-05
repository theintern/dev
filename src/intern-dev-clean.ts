#!/usr/bin/env node

import { rm } from 'shelljs';
import { dirname, isAbsolute, join, relative } from 'path';
import { getConfigs, log, readTsconfigFile } from './common';

getConfigs().forEach(configFile => {
	const config = readTsconfigFile(configFile);
	let outDir = config.options && config.options.outDir;
	if (outDir) {
		if (!isAbsolute(outDir)) {
			outDir = join(dirname(configFile), outDir);
		}
		outDir = relative(process.cwd(), outDir);
		log(`Removing ${outDir}`);
		rm('-rf', outDir);
	}
});

log('Done cleaning');
