const assert = require( 'assert' );

describe( 'blank page', () => {
	beforeEach( async () => {
		await browser.url( '/wiki/Special:BlankPage?uselang=en' );
	} );

	it( 'describes itself as blank', async () => {
		const content = await $( '#mw-content-text' );
		assert.strictEqual( await content.getText(), 'This page is intentionally left blank.' );
	} );
} );
