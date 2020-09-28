/* eslint-env node */
module.exports = {
	env: {
		browser: true,
		es6: true,
	},
	extends: [
		'wikimedia',
		'wikimedia/jquery',
		'wikimedia/language/es2019',
	],
	globals: {
		mediaWiki: 'readable',
		jQuery: 'readable',
		OO: 'readable',
		wikibase: 'readable',
	},
	rules: {
		'arrow-parens': [ 'error', 'as-needed' ],
		'comma-dangle': [ 'error', 'always-multiline' ],
		'no-irregular-whitespace': [ 'error', { skipStrings: true, skipComments: true } ],
		'no-promise-executor-return': 'off', // eslint/eslint#13668
	},
};
