#!/usr/bin/env node

import { dirname, join, relative, resolve, sep } from 'path';
import { existsSync, readFileSync } from 'fs';

const Metalsmith = require('metalsmith');
const anchor = require('markdown-it-anchor');
const assets = require('metalsmith-assets');
const collections = require('metalsmith-collections');
const frontmatter = require('metalsmith-matters');
const headings = require('metalsmith-headings');
const highlight = require('markdown-it-highlightjs');
const layouts = require('metalsmith-layouts');
const markdown = require('metalsmith-markdownit');
const packagejson = require('metalsmith-packagejson');
// const serve = require('metalsmith-serve');
// const watch = require('metalsmith-watch');

const metalsmith = new Metalsmith(__dirname);

// If the repo has a docs dir, use that as the source. If not, use the base
// repo directory as the source and ignore everything by default.
if (existsSync('docs')) {
	metalsmith.source(join(process.cwd(), 'docs'));
} else {
	metalsmith.source(process.cwd()).ignore('*').ignore('.*');
}

metalsmith
	.frontmatter(false)
	.use(
		frontmatter({
			delims: ['<!-- ---', '--- -->']
		})
	)
	.metadata({
		basePartials: join(__dirname, 'layouts', 'partials') + sep,
		site: {
			name: 'The Intern',
			description: 'Software testing for humans'
		}
	})
	.use(updateOrder())
	.use(
		collections({
			pages: { pattern: ['**/*.md'], sortBy: 'order' }
		})
	)
	.use(packagejson())
	.use(repositoryUrl())
	.use(addReadme())
	.use(filterGhContent())
	.use(pageType())
	.use(gfmarkdown())
	.use(inline())
	.use(
		headings({
			selectors: ['h1', 'h2', 'h3']
		})
	)
	.use(menuify())
	.use(fixLayoutPath())
	.use(
		layouts({
			engine: 'ejs',
			default: 'doc.ejs',
			directory: join(__dirname, 'layouts')
		})
	)
	.use(
		assets({
			source: 'assets'
		})
	)
	// .use(
	// 	serve({
	// 		port: 4000,
	// 		verbose: true
	// 	})
	// )
	// .use(
	// 	watch({
	// 		paths: {
	// 			'${source}/**/*': true
	// 		},
	// 		livereload: true
	// 	})
	// )
	.ignore('**/*.svg')
	.ignore('**/*.ejs')
	.destination(join(process.cwd(), '_build', 'docs'));

metalsmith.build((error: Error) => {
	if (error) {
		throw error;
	}
	console.log('Build finished!');
});

/**
 * Create a markdown parser than highlights code blocks and replaces relative
 * markdown links with links to HTML files.
 */
function gfmarkdown() {
	const md = markdown().use(anchor).use(highlight);

	// Add a link parser rule to convert markdown links to HTML links
	const defaultRender =
		md.parser.renderer.rules.link_open ||
		((tokens: any[], idx: number, options: any, _env: any, self: any) => {
			return self.renderToken(tokens, idx, options);
		});
	md.parser.renderer.rules.link_open = function(
		tokens: any[],
		idx: number,
		options: any,
		env: any,
		self: any
	) {
		const hrefIdx = tokens[idx].attrIndex('href');
		const href = tokens[idx].attrs[hrefIdx];
		if (/\.md/.test(href[1])) {
			const [file, hash] = href[1].split('#');
			let newHref = file.replace(/\.md$/, '.html');
			if (hash) {
				newHref += `#${hash}`;
			}
			href[1] = newHref;
		}
		return defaultRender(tokens, idx, options, env, self);
	};

	return md;
}

/**
 * Add a page type attribute to each page
 */
function addReadme() {
	return (
		files: { [key: string]: any },
		metalsmith: any,
		done: (error?: Error) => {}
	) => {
		const readme = join(process.cwd(), 'README.md');
		if (!existsSync(readme)) {
			done();
		} else {
			metalsmith.readFile(
				relative(metalsmith.source(), readme),
				(error: NodeJS.ErrnoException, data: any) => {
					if (error) {
						done(error);
					} else {
						// Add the README file to the pages list
						const pages = metalsmith.metadata().pages;
						pages.unshift(data);

						files['index.md'] = data;
						data.path = 'index.html';
						done();
					}
				}
			);
		}
	};
}

/**
 * Add a default 'order' value to pages that don't have one already
 */
function updateOrder() {
	return (
		files: { [key: string]: any },
		_metalsmith: any,
		done: () => {}
	) => {
		const unordered = Object.keys(files).filter(filename => {
			return files[filename].order == null;
		});
		const start = Object.keys(files).reduce((max, filename) => {
			const file = files[filename];
			return file.order != null ? Math.max(max, file.order) : max;
		}, 0);
		unordered.forEach((filename, idx) => {
			files[filename].order = start + idx + 1;
		});
		done();
	};
}

/**
 * Add a page type attribute to each doc page. Note that the README is excluded
 * from this group.
 */
function pageType() {
	return (
		_files: { [key: string]: any },
		metalsmith: any,
		done: () => {}
	) => {
		const pages = metalsmith.metadata().collections.pages;
		pages.forEach((page: any) => {
			if (page.layout == null) {
				page.layout = 'doc.ejs';
			}
		});
		done();
	};
}

/**
 * Filter out github-specific content
 */
function filterGhContent() {
	return (
		files: { [key: string]: any },
		_metalsmith: any,
		done: () => {}
	) => {
		const markers = [
			/<!-- vim-markdown-toc[^]*?<!-- vim-markdown-toc -->/,
			/<!-- start-github-only[^]*?<!-- end-github-only -->/g
		];
		Object.keys(files).forEach(filename => {
			const file = files[filename];
			let contents = file.contents.toString('utf-8');
			markers.forEach(marker => {
				if (marker.test(contents)) {
					contents = contents.replace(marker, '');
				}
			});
			file.contents = Buffer.from(contents, 'utf8');
		});
		done();
	};
}

/**
 * Update page metadata to support menu generation
 */
function menuify() {
	return (
		_files: { [key: string]: any },
		metalsmith: any,
		done: () => {}
	) => {
		metalsmith.metadata().pages.forEach((page: any) => {
			// Add a 'target' attribute that points to the rendered file
			// location
			page.target = page.path.replace(/\.md$/, '.html');

			// Set the file's title based on the first h1, if it's not already
			// set
			if (!page.title) {
				const h1 = page.headings.find(
					(heading: any) => heading.tag === 'h1'
				);
				page.title = h1.text;
			}

			// Create the menu for a given file
			page.menu = [];
			const menuHeadings = page.headings.filter(
				(heading: any) => heading.tag !== 'h1'
			);
			let h2: { text: string; id: string; children: any[] };
			menuHeadings.forEach((heading: any) => {
				if (heading.tag === 'h2') {
					h2 = { text: heading.text, id: heading.id, children: [] };
					page.menu.push(h2);
				} else if (heading.tag === 'h3') {
					h2.children.push({ text: heading.text, id: heading.id });
				}
			});
		});
		done();
	};
}

/**
 * Add a helper function to inline a resource
 */
function inline() {
	return (
		_files: { [key: string]: any },
		metalsmith: any,
		done: () => {}
	) => {
		metalsmith.metadata().inline = (path: string) => {
			if (path[0] === '/') {
				path = path.slice(1);
				path = join(metalsmith.directory(), 'assets', path);
			}
			return readFileSync(path, {
				encoding: 'utf8'
			});
		};
		done();
	};
}

/**
 * Cleanup the repo URL loaded from the package.json
 */
function repositoryUrl() {
	return (
		_files: { [key: string]: any },
		metalsmith: any,
		done: () => {}
	) => {
		const pkg = metalsmith.metadata().pkg;
		const repository = pkg.repository;
		metalsmith.metadata().repository = repository.url.replace(/\.git$/, '');
		done();
	};
}

function fixLayoutPath() {
	return (
		files: { [key: string]: any },
		_metalsmith: any,
		done: () => {}
	) => {
		Object.keys(files).forEach(filename => {
			const file = files[filename];
			if (/\.\//.test(file.layout)) {
				file.layout = resolve(
					join(metalsmith.source(), dirname(file.path), file.layout)
				);
				console.log(
					'updated layout of ' + filename + ' to ' + file.layout
				);
			}
		});
		done();
	};
}
