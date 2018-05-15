'use strict';

module.exports = {
	useTabs: true,
	singleQuote: true,
	tabWidth: 4,
	proseWrap: 'always',

	overrides: [
		{
			files: '*.md',
			options: {
				useTabs: false
			}
		}
	]
};
