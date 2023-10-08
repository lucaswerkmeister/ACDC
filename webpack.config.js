const webpack = require( 'webpack' );
const StatsPlugin = require( 'stats-webpack-plugin' );
const TerserPlugin = require( 'terser-webpack-plugin' );

module.exports = {
	entry: './acdc.js',
	mode: 'production',
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [
							[
								'@babel/preset-env',
								{
									useBuiltIns: 'usage',
									corejs: 3,
									exclude: [
										// polyfilled via web2017-polyfills ResourceLoader module:
										'web.url',
										'web.url-search-params',
										// supported everywhere, we don’t care about the subtle edge cases that core-js polyfills:
										'es.array.filter',
										'es.array.includes',
										'es.array.index-of', // not actually used, false positive from prefix.indexOf( '|' ) where prefix is a String, not an Array
										'es.array.map',
										'es.array.reduce',
										'es.array.slice',
										'es.array.some',
										'es.array.splice',
										'es.promise',
										'es.string.replace',
										'es.string.search', // not actually used, false positive from response.query.search where response is API response JSON
										'es.string.split',
									],
								},
							],
						],
					},
				},
			},
		],
	},
	optimization: {
		minimize: true,
		minimizer: [
			new TerserPlugin( {
				extractComments: false,
			} ),
		],
	},
	plugins: [
		new webpack.BannerPlugin( `
Add to Commons / Descriptive Claims (ACDC)

Gadget to add a collection of statements to a set of files.

Documentation: [[Help:Gadget-ACDC]]
(https://commons.wikimedia.org/wiki/Help:Gadget-ACDC)

This version was built with webpack and Babel.
You can find the original source code on GitHub:

https://github.com/lucaswerkmeister/ACDC

That is also where development happens –
please do not edit this page directly –
and where you can find out more about the licenses
of some of the code (polyfills) included in this page.
` ),
		new StatsPlugin( 'stats.json' ),
	],
	profile: true,
};
