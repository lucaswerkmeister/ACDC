const assert = require( 'assert' ),
	fs = require( 'fs' ).promises,
	process = require( 'process' ),
	ACDC = require( '../pageobjects/acdc' );

describe( 'AC/DC', () => {
	let acdc;

	before( 'load AC/DC code from disk', async () => {
		acdc = await fs.readFile( 'acdc.js', { encoding: 'utf8' } );
	} );

	async function injectAcdc() {
		await browser.waitUntil( () => browser.execute(
			() => window.mediaWiki !== undefined &&
				window.jQuery !== undefined &&
				window.mediaWiki.loader.using !== undefined ) );
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
			// note: if the dialog is already opened, the link is not interactable
			// and we can’t use getText(), so use getHTML( false ) instead
			assert.ok( ( await content.getHTML( false ) ).includes( 'AC/DC' ) );
		} );

		it( 'opens the dialog', async () => {
			const dialog = await $( '.acdc-statementsDialog' );
			await dialog.waitForDisplayed();
		} );
	} );

	describe( 'FilesWidget', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc();
			await ( await ACDC.dialog ).waitForDisplayed();
		} );

		it( 'supports entering the full file name', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1.pdf' );
			browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText, 'File:ACDC test file 1.pdf' );
		} );

		it( 'adds missing File: prefix', async () => {
			await ACDC.setFileInputValue( /* File: */ 'ACDC test file 1.pdf' );
			browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText, 'File:ACDC test file 1.pdf' );
		} );

		it( 'supports autocompletion', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1' /* .pdf */ );
			const menu = await $( '.oo-ui-lookupElement-menu' );
			await menu.waitForDisplayed();
			browser.keys( [ 'Enter' ] ); // we don’t do anything special with the menu, Enter should select the first suggestion
			assert.strictEqual( await ACDC.tagItemText, 'File:ACDC test file 1.pdf' );
		} );
	} );

	describe( 'statements', () => {
		beforeEach( 'open blank page, inject AC/DC code and log in', async function () {
			const username = process.env.MEDIAWIKI_USERNAME,
				password = process.env.MEDIAWIKI_PASSWORD;
			if ( username === undefined || password === undefined ) {
				this.skip();
			}

			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc();

			await browser.executeAsync( async ( username, password, done ) => {
				const api = new mediaWiki.Api();
				const token = ( await api.get( {
					action: 'query',
					meta: 'tokens',
					type: 'login',
				} ) ).query.tokens.logintoken;
				await api.post( {
					action: 'login',
					lgname: username,
					lgpassword: password,
					lgtoken: token,
				} );
				done();
			}, username, password );
		} );

		it( 'can add a single statement', async () => {
			const file = 'File:ACDC test file 1.pdf';
			const entityId = await browser.executeAsync( async ( file, done ) => {
				const api = new mediaWiki.Api();
				const pageId = ( await api.get( {
					action: 'query',
					titles: file,
					formatversion: 2,
				} ) ).query.pages[ 0 ].pageid;
				done( `M${pageId}` );
			}, file );
			const propertyId = 'P694';
			const value = 'Q15';
			// reset entity first
			await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				const token = ( await api.get( {
					action: 'query',
					meta: 'tokens',
				} ) ).query.tokens.csrftoken;
				await api.post( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'clear for browser test',
					token,
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} );
				done();
			}, entityId );

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			const addStatementButton = await dialog.$( '.wbmi-add-property .oo-ui-buttonElement-button' );
			await addStatementButton.click();
			const addStatementInput = await dialog.$( '.wbmi-entityview-add-statement-property .oo-ui-inputWidget-input' );
			await addStatementInput.waitForDisplayed();
			await addStatementInput.setValue( propertyId );
			const propertyEntry = await dialog.$( '.wbmi-entityselector-itemcontent' );
			await propertyEntry.waitForDisplayed();
			await propertyEntry.click();

			const statementsWidget = await dialog.$( '.wbmi-statements-widget' );
			await statementsWidget.waitForDisplayed();

			const valueInput = await statementsWidget.$( '.wbmi-statement-input input' );
			await valueInput.setValue( value );
			const valueEntry = await statementsWidget.$( '.wbmi-entityselector-itemcontent' );
			await valueEntry.waitForDisplayed();
			await valueEntry.click();

			const submitButton = await dialog.$( '.oo-ui-processDialog-actions-primary .oo-ui-buttonElement-button' );
			await submitButton.click();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( /* ms: */ undefined, /* reverse: */ true );
			const entityData = await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				done( ( await api.get( {
					action: 'wbgetentities',
					ids: entityId,
				} ) ).entities[ entityId ] );
			}, entityId );

			assert.strictEqual(
				entityData.statements[ propertyId ][ 0 ].mainsnak.datavalue.value.id,
				value );
		} );
	} );
} );
