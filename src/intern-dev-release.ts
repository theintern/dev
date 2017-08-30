#!/usr/bin/env node

//
// This script creates and publishes new release of a project. The basic process is:
//
//   1. Create a temporary clone of the repo. All work will be done from the clone.
//   2. Update the source for the version being released, commit, and tag.
//   3. Update the source for the new version, and commit that.
//   4. Checkout the tagged version.
//   5. Build it.
//   6. Give the user a chance to review, then publish
//   7. Push the new commits and tag back to the original repo.
//

import { echo, mkdir, rm, test } from 'shelljs';
import * as semver from 'semver';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { format } from 'util';
import { buildDir, exec, internDev, log } from './common';
import { join } from 'path';
import { createInterface } from 'readline';
import { red } from 'chalk';

function cleanup() {
	log('Cleaning up...');
	process.chdir(rootDir);
	rm('-rf', tmpDir);
}

function printUsage() {
	echo('Usage: intern-dev-release [help] [b=branch] [v=version] [p=prerelease]\n');
	echo('\n');
	echo('  help        Displays this message\n');
	echo('  branch      Branch to release; defaults to the current branch.\n');
	echo('  version     Version to release; defaults to what is listed in the\n');
	echo('              package.json in the branch. It should only be specified\n');
	echo('              for pre-releases\n');
	echo("  prerelease  A prerelease tag to attach to the version, like 'alpha'\n");
	echo("              or 'beta'.\n");
}

async function prompt(...args: any[]) {
	const question = format(args[0], ...args.slice(1));
	return new Promise<string>(function (resolve) {
		rl.question(question, resolve);
	});
}

function loadPackageJson() {
	return JSON.parse(readFileSync('package.json', { encoding: 'utf8' }));
}

function updatePackageVersion(version: string) {
	const packageJson = loadPackageJson();
	packageJson.version = version;
	writeFileSync('package.json', JSON.stringify(packageJson, null, '  '));
}

const rl = createInterface({
	input: process.stdin,
	output: process.stdout
});

let branch = exec('git rev-parse --abbrev-ref HEAD').stdout.replace(/\s+$/, '');
// the version to be released
let version: string;
// the tag that will be applied to the package in the npm registry
let npmTag: string;
// the next pre-release version that will be set on the original branch after tagging
let preVersion: string;
// a prerelease tag to attach to the version
let preTag: string;
// the name of the new release branch that should be created if this is not a patch release
let newBranch: string;
// the pre-release version that will be set on the minor release branch
let branchVersion: string;

process.argv.slice(2).forEach(arg => {
	if (arg === 'help') {
		printUsage();
		process.exit(0);
	}

	const [key, value] = arg.split('=', 2);
	switch (key) {
		case 'b':
			branch = value;
			break;

		case 'v':
			version = value;
			break;

		case 't':
			npmTag = value;
			break;

		case 'p':
			preTag = value;
			break;

		default:
			echo(`Invalid argument "${arg}"\n\n`);
			printUsage();
			process.exit(1);
	}
});

const rootDir = process.cwd();
const tmpDir = '_publish';
let exitCode = 0;
let pushBranches = [branch];

if (!npmTag) {
	if (preTag || version) {
		// If a prerelease tag or custom version were specified, this will be the 'next' version
		npmTag = 'next';
	}
	else {
		// If a custom version wasn't specified, this will be the latest version
		npmTag = 'latest';
	}
}

(async function main() {
	try {
		if (branch !== 'master') {
			let question = `Are you sure you want to create a release from branch ${branch}?\n` +
				'Enter "y" to continue, any other key to abort.\n' +
				'> ';

			if (await prompt(question) !== 'y') {
				throw new Error('Aborted');
			}
		}

		const output = exec('git config receive.denyCurrentBranch').stdout;
		if (output.indexOf('updateInstead') !== 0) {
			throw new Error('Repository should have receive.denyCurrentBranch set to "updateInstead"');
		}

		const currentBranch = exec('git rev-parse --abbrev-ref HEAD').stdout.replace(/\s+$/, '');
		if (branch === currentBranch) {
			try {
				exec('git diff-index --quiet HEAD');
			}
			catch (error) {
				log(red('Warning: You have uncommitted changes.'));
			}
		}

		let message = `Creating a new release from branch ${branch}`;
		if (version) {
			message += ` with version override ${version}`;
		}
		log(`${message}.`);

		// Create a package build directory and clone this repo into it
		process.chdir(rootDir);
		if (test('-d', tmpDir)) {
			cleanup();
		}
		mkdir(tmpDir);
		exec(`git clone --recursive . ${tmpDir}`);

		// Cd into the build dir and checkout the branch that's being released
		process.chdir(tmpDir);
		log(`Building branch "${branch}"...`);
		exec(`git checkout ${branch}`);

		// Load package JSON from the build directory
		const packageJson = loadPackageJson();

		// Determine the proper version numbers for release and for repo post-release
		if (!version) {
			// Use the version from package.json in the currently checked out branch
			version = packageJson.version;

			if (!semver.prerelease(version)) {
				throw new Error('Releases may only be generated from pre-release versions');
			}

			version = `${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}`;

			if (preTag) {
				version += `-${preTag}`;

				// Get all the x.y.z-preTag.w versions
				const tagLines = exec('git show-ref --tags --abbrev').stdout.replace(/\s+$/, '').split('\n');
				const tags = tagLines.map(line => /refs\/tags\/(.*)/.exec(line)[1]);
				const sameVersionTags = tags.filter(tag => {
					try {
						return semver.major(tag) === semver.major(version) &&
							semver.minor(tag) === semver.minor(version) &&
							semver.patch(tag) === semver.patch(version) &&
							semver.prerelease(tag)[0] === preTag;
					}
					catch (error) {
						return false;
					}
				});
				sameVersionTags.sort((a, b) => {
					const preA = Number(semver.prerelease(a)[1]);
					const preB = Number(semver.prerelease(b)[1]);
					return preB - preA;
				});

				// Increment the latest x.y.z-preTag.w version _or_ the current version
				version = semver.inc(sameVersionTags[0] || version, 'prerelease', <any>preTag);
			}
		}
		else {
			if (semver.gte(packageJson.version, version)) {
				throw new Error('Provided version must be >= current version');
			}
		}

		// Check that the version hasn't already been tagged
		const tags = exec('git tag').stdout;
		tags.split('\n').forEach(function (tag) {
			if (tag === version) {
				throw new Error('Version ' + tag + ' has already been tagged');
			}
		});

		// Pre-release or non-branching updates
		if (semver.major(version) === 0 || semver.patch(version) !== 0 || semver.prerelease(version)) {
			preVersion = semver.inc(version, 'patch') + '-pre';
		}
		// If the patch digit is a 0, this is a new major/minor release
		else {
			// The new branch we'll be making for this major/minor release
			newBranch = `${semver.major(version)}.${semver.minor(version)}`;

			// The full version of the next release in the new branch
			branchVersion = semver.inc(version, 'patch') + '-pre';

			// The next version on master is usually going to be a minor release; if the next version is to be a major
			// release, the package version will need to be manually updated in Git before release e.g., current is
			// 2.1.0, pre will be 2.2.0-pre
			preVersion = semver.inc(version, 'minor') + '-pre';
		}

		// Set the package version to release version and commit the new release
		updatePackageVersion(version);
		exec(`git commit -m "Updating metadata for ${version}" package.json`);
		exec(`git tag -a -m "Release ${version}" ${version}`);

		// Check out the previous package.json
		exec('git checkout HEAD^ package.json');
		exec('git reset package.json');

		// Set the package version to next pre-release version and commit the pre-release
		updatePackageVersion(preVersion);
		exec(`git commit -m "Updating source version to ${preVersion}" package.json`);

		// If this is a major/minor release, we also create a new branch for it
		if (newBranch) {
			log(`Creating new branch ${newBranch}...`);
			// Create the new branch starting at the tagged release version
			exec(`git checkout -b ${newBranch} ${version}`);

			// Set the package version to the next patch pre-release version and commit the pre-release
			updatePackageVersion(branchVersion);
			exec(`git commit -m "Updating source version to ${branchVersion}" package.json`);

			// Store the branch as one that needs to be pushed when we are ready to deploy the release
			pushBranches.push(newBranch);
		}

		// Checkout and build the new release in preparation for publishing
		log(`Checking out and building ${version}...`);
		exec(`git checkout ${version}`);
		exec('npm install');
		exec('npm run build');

		// Give the user a chance to verify everything is good before making any updates
		log('Done!');

		let publishDir = internDev && internDev.publishDir;
		if (!publishDir) {
			publishDir = buildDir;
			if (existsSync(join(buildDir, 'src'))) {
				publishDir = join(buildDir, 'src');
			}
		}

		log(`Package to be published from ${tmpDir}/${publishDir}.`);

		let question = 'Please confirm packaging success, then enter "y" to publish to npm\n' +
			`'${npmTag}', push tag '${version}', and upload. Enter any other key to bail.\n` +
			'> ';

		if (await prompt(question) !== 'y') {
			log('Not publishing');
			throw new Error('Aborted');
		}

		// Publish the package from <rootDir>/<tmpDir>/<publishDir> or <rootDir>/<tmpDir>/<buildDir>
		process.chdir(publishDir);
		exec(`npm publish --tag ${npmTag} --access public`);

		// Update the original repo with the new branch and tag pointers
		pushBranches.map(function (branch) {
			exec(`git push origin ${branch}`);
		});
		exec('git push origin --tags');

		log('All done! Yay!');
	}
	catch (error) {
		if (error.message !== 'Aborted') {
			// Something broke -- display an error
			log(`${red(error.stack)}`);
			log('Aborted.');
			exitCode = 1;
		}
	}
	finally {
		if (exitCode !== 1) {
			cleanup();
		}

		process.exit(exitCode);
	}
})();
