import { readFileSync } from 'fs';
import { cp, echo, exec as shellExec, mkdir, sed, test, ExecOptions, ExecOutputReturnValue } from 'shelljs';
import { sync as globSync, IOptions } from 'glob';
import { basename, dirname, join, normalize } from 'path';

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

export interface FilePattern {
	base: string;
	pattern: string;
}

/**
 * Copy the files denoted by an array of glob patterns into a given directory.
 */
export function copyAll(patterns: (string | FilePattern)[], outDir: string) {
	patterns.forEach(pattern => {
		let filePattern: string;
		const options: IOptions = {};

		if (typeof pattern !== 'string') {
			options.cwd = pattern.base;
			filePattern = pattern.pattern;
		}
		else {
			options.cwd = '.';
			filePattern = pattern;
		}

		glob(filePattern, options).forEach(function (filename) {
			const dst = join(outDir, filename);
			const dstDir = dirname(dst);
			if (!test('-d', dstDir)) {
				mkdir('-p', dstDir);
			}
			echo(`## Copying ${filename} to ${dst}`);
			cp(join(options.cwd, filename), dst);
		});
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
		let message = result.stderr || result.stdout;
		if (!message) {
			message = `"${command}" returned non-zero exit code ${result.code}`;
		}
		throw new Error(message);
	}
	return result;
}

/**
 * If the project has inline sources in source maps set, set the path to the
 * source file to be a sibling of the compiled file.
 */
export function fixSourceMaps() {
	globSync(join(buildDir, '**', '*.js.map'), { nodir: true }).forEach(filename => {
		sed('-i', /("sources":\[")(.*?)("\])/,
			`$1${basename(filename, '.js.map')}.ts$3`, filename);
	});
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
			'*.{html,md}',
			'!(tsconfig|tslint).json',
			'types/**',
			'bin/**'
		],
		'.': [
			'{src,tests}/**/*.{css,d.ts,html,js}',
			'src/**/!(tsconfig).json',
			'tests/**/!(tsconfig).json'
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
export function glob(pattern: string, options?: IOptions) {
	options = options || {};

	if (!('nodir' in options)) {
		options.nodir = true;
	}

	if (!('ignore' in options)) {
		let globIgnore = [ 'node_modules/**', `${buildDir}/**` ];
		if (internDev && internDev.ignore) {
			globIgnore = globIgnore.concat(internDev.ignore);
		}
		options.ignore = globIgnore;
	}

	return globSync(pattern, options);
}
