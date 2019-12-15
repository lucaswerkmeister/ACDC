/* eslint-env webextensions */
/* eslint-disable no-eval */

( function () {
	const acdcPromise = fetch( browser.runtime.getURL( 'acdc.js' ) ).then( r => r.text() );
	let delay = 1;

	function waitForGlobals() {
		if ( window.eval( 'typeof mediaWiki !== "undefined" && typeof jQuery !== "undefined"' ) ) {
			acdcPromise.then( window.eval );
		} else {
			setTimeout( waitForGlobals, delay *= 1.5 );
		}
	}

	waitForGlobals();
}() );
