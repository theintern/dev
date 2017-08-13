#!/usr/bin/env node

import { join, relative } from 'path';
import { existsSync, readFileSync } from 'fs';

const Metalsmith = require('metalsmith');
const assets = require('metalsmith-assets');
const frontmatter = require('metalsmith-matters');
const packagejson = require('metalsmith-packagejson');
const markdown = require('metalsmith-markdownit');
const hljs = require('highlight.js');
const anchor = require('markdown-it-anchor');
const headings = require('metalsmith-headings');
const layouts = require('metalsmith-layouts');
const collections = require('metalsmith-collections');
const stylus = require('stylus');
const rupture = require('rupture');
const typographic = require('typographic');
const nib = require('nib');

// Build the docs
let metalsmith = new Metalsmith(__dirname)
	.frontmatter(false)
	.use(
		frontmatter({
			delims: ['<!-- ---', '--- -->']
		})
	)
	.use(updateOrder())
	.use(
		collections({
			pages: { pattern: '**/*.md', sortBy: 'order' }
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
	.use(
		layouts({
			engine: 'ejs',
			default: 'doc.ejs',
			directory: join(__dirname, 'layouts')
		})
	)
	.use(styles())
	.use(
		assets({
			source: 'assets'
		})
	)
	.destination(join(process.cwd(), '_build', 'docs'));

if (existsSync('docs')) {
	metalsmith.source(join(process.cwd(), 'docs')).ignore('**/*.svg');
} else {
	metalsmith.source(process.cwd()).ignore('*').ignore('.*');
}

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
	const md = markdown({
		// Syntax highlight with hilight.js
		highlight: (str: string, lang: string) => {
			if (lang && hljs.getLanguage(lang)) {
				try {
					return (
						`<pre class="hljs"><code class="language-${lang}">` +
						hljs.highlight(lang, str, true).value +
						'</code></pre>'
					);
				} catch (_) {
					// ignore
				}
			}

			return '<pre class="hljs"><code>' + str + '</code></pre>';
		},
		// allow HTML in markdown to pass through
		html: true
	}).use(anchor);

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
		const readme = relative(
			metalsmith.source(),
			join(process.cwd(), 'README.md')
		);
		metalsmith.readFile(readme, (error: Error, data: any) => {
			if (error) {
				done(error);
			} else {
				files['index.md'] = data;
				data.html_type = '';
				data.path = readme;
				if (!data.body_type) {
					data.body_type = 'page-secondary page-docs';
				}
				done();
			}
		});
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
			page.layout = 'doc.ejs';
			page.html_type = 'html-fixed';
			page.body_type = 'page-secondary page-docs';
		});
		done();
	};
}

/**
 * Build styles
 */
function styles(options?: { [key: string]: any }) {
	options = options || {};

	return (
		files: { [key: string]: any },
		_metalsmith: any,
		done: () => {}
	) => {
		const dest = options.destination || 'css';
		const styles = join(__dirname, 'styles');
		const styleFile = join(styles, 'style.styl');
		const mainStyle = readFileSync(styleFile, { encoding: 'utf8' });
		const css = stylus(mainStyle)
			.use(typographic())
			.import('typographic')
			.use(rupture())
			.use(nib())
			.include(styles)
			.set('filename', mainStyle)
			.render();

		files[`${dest}/style.css`] = {
			contents: Buffer.from(css)
		};

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
		files: { [key: string]: any },
		_metalsmith: any,
		done: () => {}
	) => {
		Object.keys(files).forEach(filename => {
			const file = files[filename];
			// Add a 'target' attribute that points to the rendered file
			// location
			file.target = file.path.replace(/\.md$/, '.html');

			// Set the file's title based on the first h1, if it's not already
			// set
			if (!file.title) {
				const h1 = file.headings.find(
					(heading: any) => heading.tag === 'h1'
				);
				file.title = h1.text;
			}

			// Create the menu for a given file
			file.menu = [];
			const menuHeadings = file.headings.filter(
				(heading: any) => heading.tag !== 'h1'
			);
			let h2: { text: string; id: string; children: any[] };
			menuHeadings.forEach((heading: any) => {
				if (heading.tag === 'h2') {
					h2 = { text: heading.text, id: heading.id, children: [] };
					file.menu.push(h2);
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
