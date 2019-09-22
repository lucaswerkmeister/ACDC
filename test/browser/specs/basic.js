const assert = require( 'assert' ),
	fs = require( 'fs' ).promises;

describe( 'AC/DC', () => {
	let acdc;

	before( 'load AC/DC code from disk', async () => {
		acdc = await fs.readFile( 'acdc.js', { encoding: 'utf8' } );
	} );

	beforeEach( 'open blank page and inject AC/DC code', async () => {
		await browser.url( '/wiki/Special:BlankPage?uselang=en' );
		await browser.waitUntil( () => browser.execute( () => window.mediaWiki !== undefined && window.jQuery !== undefined ) );
		await browser.execute( acdc );
	} );

	it( 'defines the portlet link', async () => {
		const portletLink = await $( '#t-acdc' );
		assert.strictEqual( await portletLink.getText(), 'AC/DC' );
	} );
} );
