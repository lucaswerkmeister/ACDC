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

	describe( 'FilesWidget', () => {
		let dialog, filesWidget, input;

		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc();
			dialog = await $( '.acdc-statementsDialog' );
			await dialog.waitForDisplayed();
			filesWidget = await dialog.$( '.acdc-filesWidget' );
			input = await filesWidget.$( '.acdc-fileInputWidget-input' );
		} );

		it( 'supports entering the full file name', async () => {
			await input.setValue( 'File:ACDC test file 1.pdf' );
			browser.keys( [ 'Enter' ] );
			const tagItem = await filesWidget.$( '.oo-ui-tagItemWidget' );
			assert.strictEqual( await tagItem.getText(), 'File:ACDC test file 1.pdf' );
		} );

		it( 'adds missing File: prefix', async () => {
			await input.setValue( /* File: */ 'ACDC test file 1.pdf' );
			browser.keys( [ 'Enter' ] );
			const tagItem = await filesWidget.$( '.oo-ui-tagItemWidget' );
			assert.strictEqual( await tagItem.getText(), 'File:ACDC test file 1.pdf' );
		} );

		it( 'supports autocompletion', async () => {
			await input.setValue( 'File:ACDC test file 1' /* .pdf */ );
			const menu = await $( '.oo-ui-lookupElement-menu' ); // note: this is not a descendant of dialog, due to $overlay
			await menu.waitForDisplayed();
			browser.keys( [ 'Enter' ] ); // we don’t do anything special with the menu, Enter should select the first suggestion
			const tagItem = await filesWidget.$( '.oo-ui-tagItemWidget' );
			assert.strictEqual( await tagItem.getText(), 'File:ACDC test file 1.pdf' );
		} );
	} );
} );
