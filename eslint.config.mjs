import globals from 'globals';
import { defineConfig, globalIgnores } from '@eslint/config-helpers';
import wikimedia from 'eslint-config-wikimedia/flat.js';

export default defineConfig( [
	globalIgnores( [
		'w/', // MediaWiki install path in CI
	] ),
	{
		files: [
			'**/*.js',
			'**/*.mjs',
		],
		extends: wikimedia( 'common', 'jsduck', 'jquery', 'language/es2019' ),
		languageOptions: {
			globals: {
				mediaWiki: 'readable',
				jQuery: 'readable',
				OO: 'readable',
				wikibase: 'readable',
				...globals.browser,
				...globals.es6,
			},
		},
		rules: {
			'arrow-parens': [ 'error', 'as-needed' ],
			'comma-dangle': [ 'error', 'always-multiline' ],
			'max-len': 'off',
			'no-irregular-whitespace': [ 'error', { skipStrings: true, skipComments: true } ],
			'no-promise-executor-return': 'off', // eslint/eslint#13668
			'jsdoc/no-undefined-types': [ 'error', { definedTypes: [
				'StatementsDialog',
				'StatementWidget',
				'WindowInstance',
			] } ],
		},
	},
	{
		files: [
			'**/*.json',
		],
		extends: wikimedia( 'common', 'json' ),
	},
	{
		files: [
			'**/*.yaml',
			'**/*.yml',
		],
		extends: wikimedia( 'common', 'yaml' ),
	},
	{
		files: [
			'test/browser/**/*.js',
		],
		languageOptions: {
			globals: {
				browser: 'readable',
				...globals.mocha,
				...globals.node,
			},
			ecmaVersion: 2021,
		},
		rules: {
			// $ refers to wdio, not jQuery, so turn off any no-jquery/* rules
			'no-jquery/no-global-selector': 'off',
			// add other no-jquery/* rules as needed (wildcards like no-jquery/* are not available)
			// we often “shadow” variables when ferrying them between node and browser via browser.executeAsync()
			'no-shadow': 'off',
		},
	},
] );
