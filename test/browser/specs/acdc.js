const assert = require( 'assert' ),
	fs = require( 'fs' ).promises;

describe( 'AC/DC', () => {
	let acdc;

	before( 'load AC/DC code from disk', async () => {
		acdc = await fs.readFile( 'acdc.js', { encoding: 'utf8' } );
	} );

	async function injectAcdc() {
		await browser.waitUntil( () => browser.execute(
			() => window.mediaWiki !== undefined && window.jQuery !== undefined ) );
		await browser.execute( acdc );
	}

	describe( 'default mode', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en' );
			await injectAcdc();
		} );

		it( 'defines the portlet link', async () => {
			const portletLink = await $( '#t-acdc' );
			assert.strictEqual( await portletLink.getText(), 'AC/DC' );
		} );

		it( 'opens the dialog when clicking the portlet link', async () => {
			const portletLink = await $( '#t-acdc' );
			await portletLink.click();
			const dialog = await $( '.acdc-statementsDialog' );
			await dialog.waitForDisplayed();
		} );
	} );

	describe( 'show-immediately mode', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc();
		} );

		it( 'defines the portlet link', async () => {
			const content = await $( '#t-acdc' );
			assert.strictEqual( await content.getText(), 'AC/DC' );
		} );

		it( 'opens the dialog', async () => {
			const dialog = await $( '.acdc-statementsDialog' );
			await dialog.waitForDisplayed();
		} );
	} );
} );
