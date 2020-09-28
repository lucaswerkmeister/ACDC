module.exports = {
	plugins: [ 'webdriverio' ],
	env: {
		mocha: true,
		node: true,
		'webdriverio/wdio': true,
	},
	rules: {
		// $ refers to wdio, not jQuery, so turn off any no-jquery/* rules
		'no-jquery/no-global-selector': 'off',
		// add other no-jquery/* rules as needed (wildcards like no-jquery/* are not available)
		// we often “shadow” variables when ferrying them between node and browser via browser.executeAsync()
		'no-shadow': 'off',
	},
};
