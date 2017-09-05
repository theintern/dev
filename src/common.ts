import { readFileSync } from 'fs';
import { ChildProcess } from 'child_process';
import {
	cp,
	echo,
	exec as shellExec,
	mkdir,
	sed,
	test,
	ExecOptions,
	ExecOutputReturnValue
} from 'shelljs';
import { sync as globSync, IOptions } from 'glob';
import { basename, dirname, join, normalize, relative, resolve } from 'path';
import { sys, readConfigFile, parseJsonConfigFileContent } from 'typescript';

export interface ExecReturnValue extends ExecOutputReturnValue {
	stdout: string;
	stderr: string;
}

// This script assumes CWD is the project root, which will be the case if the
// dev scripts are running via NPM

const packageJson = readJsonFile('package.json');
const internDev = packageJson.internDev || {};
export { internDev };

const tsconfig = readTsconfigFile('tsconfig.json');
// normalize the buildDir because tsconfig likes './', but glob (used later)
//
// does not
const buildDir = relative(process.cwd(), normalize(tsconfig.options.outDir!));
export { buildDir, tsconfig };

export interface FilePattern {
	base: string;
	pattern: string;
}

/**
 * Compile a project
 */
export function compile(
	tsconfig: string,
	watch = false
): ExecOutputReturnValue | ChildProcess {
	let cmd = `tsc -p "${tsconfig}"`;
	let opts: ExecOptions = {};
	if (watch) {
		cmd += ' --watch';
		opts.async = true;
	}
	return exec(cmd, opts);
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
		} else {
			options.cwd = '.';
			filePattern = pattern;
		}

		glob(filePattern, options).forEach(function(filename) {
			const dst = join(outDir, filename);
			const dstDir = dirname(dst);
			if (!test('-d', dstDir)) {
				mkdir('-p', dstDir);
			}
			log(`Copying ${filename} to ${dst}`);
			cp(join(options.cwd!, filename), dst);
		});
	});
}

/**
 * Synchronously run a command. Exit if the command fails. Otherwise return an
 * object:
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
	const result = <ExecReturnValue>shellExec(command, options);
	if (result.code) {
		throw new ExecError(command, result.code, result.stdout, result.stderr);
	}
	return result;
}

/**
 * If the project has inline sources in source maps set, set the path to the
 * source file to be a sibling of the compiled file.
 */
export function fixSourceMaps() {
	globSync(join(buildDir, '**', '*.js.map'), {
		nodir: true
	}).forEach(filename => {
		sed(
			'-i',
			/("sources":\[")(.*?)("\])/,
			`$1${basename(filename, '.js.map')}.ts$3`,
			filename
		);
	});
}

/**
 * Get the set of non-source code resources that are part of the build.
 */
export function getConfigs(): string[] {
	if (internDev && internDev.configs) {
		return internDev.configs;
	}
	return ['tsconfig.json'].concat(glob('*/**/tsconfig.json'));
}

/**
 * Get the set of non-source code resources that are part of the build.
 */
export function getResources() {
	return (internDev && internDev.resources) || {};
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
		let globIgnore = ['node_modules/**', `${buildDir}/**`];
		if (internDev && internDev.ignore) {
			globIgnore = globIgnore.concat(internDev.ignore);
		}
		options.ignore = globIgnore;
	}

	return globSync(pattern, options);
}

/**
 * Lint a project
 */
export function lint(tsconfigFile: string) {
	// Use the tslint file from this project if the project doesn't have one of
	// its own
	let tslintJson = test('-f', 'tslint.json')
		? 'tslint.json'
		: resolve(join(__dirname, 'tslint.json'));
	return exec(`tslint -c "${tslintJson}" --project "${tsconfigFile}"`);
}

/**
 * Log a message to the console
 */
export function log(...args: any[]) {
	echo(`${new Date().toLocaleTimeString()} -`, ...args);
}

/**
 * Parse JSON that may include comments
 */
export function parseJson(text: string) {
	const textToParse = removeComments(text);
	return JSON.parse(textToParse);
}

/**
 * Read and parse a JSON file
 */
export function readJsonFile(filename: string) {
	return parseJson(readFileSync(filename, { encoding: 'utf8' }));
}

/**
 * Read a tsconfig file, which may extend other tsconfig files
 */
export function readTsconfigFile(filename: string) {
	let data = readConfigFile(filename, (name: string) =>
		readFileSync(name, { encoding: 'utf8' })
	);
	if (data.error) {
		throw data.error;
	}

	// TS will sometimes normalize config paths to lowercase. This can cause
	// issues with path functions like path.resolve.
	sys.useCaseSensitiveFileNames = true;

	const config = parseJsonConfigFileContent(
		data.config,
		sys,
		dirname(resolve(filename))
	);
	if (config.errors.length > 0) {
		throw new Error(<string>config.errors[0].messageText);
	}
	return config;
}

/**
 * Run stylus
 */
export function stylus(
	files: string[],
	watch = false
): ExecReturnValue | ChildProcess {
	let cmd = `stylus "${files.join('","')}"`;
	let opts: ExecOptions = {};
	if (watch) {
		cmd += ' --watch';
		opts.async = true;
	}
	return exec(cmd, opts);
}

/**
 * Run webpack
 */
export function webpack(
	config: string,
	watch = false
): ExecReturnValue | ChildProcess {
	let cmd = `webpack --config "${config}"`;
	let opts: ExecOptions = {};
	if (watch) {
		cmd += ' --watch';
		opts.async = true;
	}
	return exec(cmd, opts);
}

export class ExecError extends Error {
	code: number;
	stdout: string;
	stderr: string;

	constructor(command: string, code: number, stdout: string, stderr: string) {
		super(`Command "${command}" failed (${code})`);
		this.name = 'ExecError';
		this.code = code;
		this.stdout = getText(stdout);
		this.stderr = getText(stderr);
	}
}

function getText(text: string) {
	text = text || '';
	return text.replace(/^\s+/, '').replace(/\s+$/, '');
}

function removeComments(text: string) {
	let state: 'string' | 'block-comment' | 'line-comment' | 'default' =
		'default';
	let i = 0;

	// Create an array of chars from the text, the blank out anything in a
	// comment
	const chars = text.split('');

	while (i < chars.length) {
		switch (state) {
			case 'block-comment':
				if (chars[i] === '*' && chars[i + 1] === '/') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'default';
					i += 2;
				} else if (chars[i] !== '\n') {
					chars[i] = ' ';
					i += 1;
				} else {
					i += 1;
				}
				break;

			case 'line-comment':
				if (chars[i] === '\n') {
					state = 'default';
				} else {
					chars[i] = ' ';
				}
				i += 1;
				break;

			case 'string':
				if (chars[i] === '"') {
					state = 'default';
					i += 1;
				} else if (chars[i] === '\\' && chars[i + 1] === '\\') {
					i += 2;
				} else if (chars[i] === '\\' && chars[i + 1] === '"') {
					i += 2;
				} else {
					i += 1;
				}
				break;

			default:
				if (chars[i] === '"') {
					state = 'string';
					i += 1;
				} else if (chars[i] === '/' && chars[i + 1] === '*') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'block-comment';
					i += 2;
				} else if (chars[i] === '/' && chars[i + 1] === '/') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'line-comment';
					i += 2;
				} else {
					i += 1;
				}
		}
	}

	return chars.join('');
}
