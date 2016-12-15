import { readFileSync } from 'fs';
import { cp, echo, exec as shellExec, mkdir, test, ExecOptions, ExecOutputReturnValue } from 'shelljs';
import { sync as globSync } from 'glob';
import { dirname, join, normalize } from 'path';
import { red } from 'chalk';

export interface ExecReturnValue extends ExecOutputReturnValue {
	stdout: string;
	stderr: string;
};

// This script assumes CWD is the project root, which will be the case if the
// dev scripts are running via NPM

const packageJson = JSON.parse(readFileSync('package.json', { encoding: 'utf8' }));
const internDev = packageJson.internDev;
export { internDev };

const tsconfig = JSON.parse(readFileSync('tsconfig.json', { encoding: 'utf8' }));
// normalize the buildDir because tsconfig likes './', but glob (used later) does not
const buildDir = normalize(tsconfig.compilerOptions.outDir);
export { buildDir, tsconfig };

/**
 * Copy the files denoted by an array of glob patterns into a given directory.
 */
export function copyAll(patterns: string[], outDir: string) {
	glob(patterns).forEach(function (filename) {
		const dst = join(outDir, filename);
		const dstDir = dirname(dst);
		if (!test('-d', dstDir)) {
			mkdir('-p', dstDir);
		}
		echo(`## Copying ${filename} to ${dst}`);
		cp(filename, dst);
	});
}

/**
 * Synchronously run a command. Exit if the command fails. Otherwise return an object:
 *
 *   {
 *     code: exit code
 *     stdout: content of stdout stream
 *     stderr: content of stderr stream
 *   }
 */
export function exec(command: string, options?: ExecOptions) {
	if (!options) {
		options = {};
	}
	if (options.silent == null) {
		options.silent = true;
	}
	const result = <ExecReturnValue> shellExec(command, options);
	if (result.code) {
		echo(red.bold('Error!'));
		echo(red(result.stderr || result.stdout));
		process.exit(result.code);
	}
	return result;
}

/**
 * Get the set of non-source code resources that are part of the build.
 */
export function getConfigs(): string[] {
	if (internDev && internDev.configs) {
		return internDev.configs;
	}
	return [ 'tsconfig.json' ].concat(glob('*/**/tsconfig.json'));
}

/**
 * Get the set of non-source code resources that are part of the build.
 */
export function getResources() {
	let resources: { [key: string]: string[] } = {
		src: [
			'.npmignore',
			'*.{html,json,md}',
			'support/**',
			'types/**',
			'bin/**'
		],

		'.': [
			'{src,tests}/**/*.{css,d.ts,html,json}'
		]
	};

	if (internDev && internDev.resources) {
		Object.keys(internDev.resources).forEach(function (dest) {
			if (resources[dest]) {
				resources[dest] = resources[dest].concat(internDev.resources[dest]);
			}
			else {
				resources[dest] = internDev.resources[dest].slice();
			}
		});
	}

	return resources;
}

/**
 * Return all matching files for all patterns.
 */
export function glob(patterns: string | string[]) {
	let globIgnore = [ 'node_modules/**', `${buildDir}/**` ];
	if (internDev && internDev.ignore) {
		globIgnore = globIgnore.concat(internDev.ignore);
	}

	if (!Array.isArray(patterns)) {
		patterns = [ patterns ];
	}

	let matches: { [filename: string]: boolean } = {};

	patterns.forEach(function (pattern) {
		globSync(pattern, { ignore: globIgnore, nodir: true }).forEach(function (filename) {
			matches[filename] = true;
		});
	});

	return Object.keys(matches);
}
