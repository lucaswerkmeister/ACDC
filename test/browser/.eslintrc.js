module.exports = {
	'plugins': [ 'webdriverio' ],
	'env': {
		'mocha': true,
		'node': true,
		'webdriverio/wdio': true,
	},
	'rules': {
		// $ refers to wdio, not jQuery, so turn off any no-jquery/* rules
		'no-jquery/no-global-selector': 'off',
		// add others as needed (wildcards like no-jquery/* are not available)
	},
};
