const webpack = require( 'webpack' );

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
									targets: [ // https://www.mediawiki.org/wiki/Compatibility#Desktop
										'last 2 Chrome versions',
										'IE 11',
										'last 2 Firefox versions',
										'Safari 5.1',
										'Opera 15',
										'iOS 6.1',
										'Android 4.1',
									],
									useBuiltIns: 'usage',
									corejs: 3,
								},
							],
						],
					},
				},
			},
		],
	},
	plugins: [
		new webpack.BannerPlugin( `
Add to Commons / Descriptive Claims (ACDC)

User script to add a collection of statements to a set of files.

Documentation: [[User:Lucas Werkmeister/ACDC]]
(https://commons.wikimedia.org/wiki/User:Lucas_Werkmeister/ACDC)

common.js snippet:

    mw.loader.load( 'https://commons.wikimedia.org/w/index.php?title=User:Lucas_Werkmeister/ACDC.js&action=raw&ctype=text/javascript' );

This version was built with webpack and Babel.
You can find the original source code on GitHub:
https://github.com/lucaswerkmeister/ACDC
That is also where development happens –
please do not edit this page directly –
and where you can find out more about the licenses
of some of the code (polyfills) included in this page.
` ),
	],
};
