#!/usr/bin/env node

// Generate API doc data for a project

import { Application } from 'typedoc';
import { isAbsolute, join, relative } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { log } from './common';

// Use TypeDoc to generate an API description
log('Generating API data');
const options = {
	tsconfig: 'tsconfig.json',
	logger: 'none',
	excludePrivate: true
};
const app = new Application(options);
const inputFiles = app.options.read(options).inputFiles;
const project = app.convert(inputFiles);
const cwd = process.cwd();

log('Scrubbing file paths');
scrubPaths(project);

const json = JSON.stringify(project.toObject(), null, '\t');

if (!existsSync('docs')) {
	log('Making docs directory');
	mkdirSync('docs');
}

const outFile = join('docs', 'api.json');
writeFileSync(outFile, json);
log(`Wrote API data to ${outFile}`);

// Recursively walk an object, relativizing any paths
function scrubPaths(reflection: any) {
	if (reflection['__visited__']) {
		return;
	}

	reflection['__visited__'] = true;

	if (Array.isArray(reflection)) {
		for (let item of reflection) {
			if (typeof item === 'object') {
				scrubPaths(item);
			}
		}
	} else if (typeof reflection === 'object') {
		const keys = Object.keys(reflection);
		for (let key of keys) {
			const value = reflection[key];
			if (value == null) {
				continue;
			}

			if (key === 'originalName' || key === 'fileName') {
				reflection[key] = scrubPath(value);
			} else if (typeof value === 'object') {
				scrubPaths(value);
			}
		}
	}
}

// Relativize a path, or return the input if it's not an absolute path
function scrubPath(value: string) {
	if (isAbsolute(value)) {
		return relative(cwd, value);
	}
	return value;
}
