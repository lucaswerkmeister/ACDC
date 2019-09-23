const assert = require( 'assert' ),
	fs = require( 'fs' ).promises,
	process = require( 'process' );

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
				// TODO when T233522 is resolved, use wbeditentity with clear
				// instead of building removeStatementsData
				const api = new mediaWiki.Api();
				const statements = ( await api.get( {
					action: 'wbgetclaims',
					entity: entityId,
				} ) ).claims;
				const removeStatementsData = { claims: {} };
				for ( const propertyId in statements ) {
					removeStatementsData.claims[ propertyId ] = [];
					for ( const statement of statements[ propertyId ] ) {
						removeStatementsData.claims[ propertyId ].push( {
							id: statement.id,
							remove: '',
						} );
					}
				}
				const token = ( await api.get( {
					action: 'query',
					meta: 'tokens',
				} ) ).query.tokens.csrftoken;
				await api.post( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'clear for browser test',
					token,
					data: JSON.stringify( removeStatementsData ),
				} );
				done();
			}, entityId );

			const dialog = await $( '.acdc-statementsDialog' );
			await dialog.waitForDisplayed();

			const filesInput = await dialog.$( '.acdc-filesWidget .acdc-fileInputWidget-input' );
			await filesInput.setValue( file );
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
