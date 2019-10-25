const assert = require( 'assert' ),
	fs = require( 'fs' ).promises,
	process = require( 'process' ),
	MWBot = require( 'mwbot' ),
	wdioConf = require( '../../../wdio.conf' ),
	ACDC = require( '../pageobjects/ACDC' );

const bot = new MWBot( { apiUrl: `${wdioConf.config.baseUrl}/w/api.php` } );

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
			const portletLink = await ACDC.portletLink;
			assert.strictEqual( await portletLink.getText(), 'AC/DC' );
		} );

		it( 'opens the dialog when clicking the portlet link', async () => {
			const portletLink = await ACDC.portletLink;
			await portletLink.click();
			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();
		} );
	} );

	describe( 'show-immediately mode', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc();
		} );

		it( 'defines the portlet link', async () => {
			const content = await ACDC.portletLink;
			// note: if the dialog is already opened, the link is not interactable
			// and we can’t use getText(), so use getHTML( false ) instead
			assert.ok( ( await content.getHTML( false ) ).includes( 'AC/DC' ) );
		} );

		it( 'opens the dialog', async () => {
			const dialog = await ACDC.dialog;
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
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
		} );

		it( 'adds missing File: prefix', async () => {
			await ACDC.setFileInputValue( /* File: */ 'ACDC test file 1.pdf' );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
		} );

		it( 'supports autocompletion', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1' /* .pdf */ );
			const menu = await $( '.oo-ui-lookupElement-menu' );
			await menu.waitForDisplayed();
			await browser.keys( [ 'Enter' ] ); // we don’t do anything special with the menu, Enter should select the first suggestion
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
		} );

		it( 'supports entering two files', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1.pdf' );
			await browser.keys( [ 'Enter' ] );
			await ACDC.setFileInputValue( 'File:ACDC test file 2.pdf' );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
			assert.strictEqual( await ACDC.tagItemText( 2 ), 'File:ACDC test file 2.pdf' );
		} );
	} );

	describe( 'statements', () => {
		const filePageIds = { // initialized in before() hook
			'File:ACDC test file 1.pdf': -1,
			'File:ACDC test file 2.pdf': -1,
		};
		const wikibaseItemPropertyId = 'P694';
		const itemId = 'Q15';

		before( 'load page IDs', async () => {
			const response = await bot.request( {
				action: 'query',
				titles: Object.keys( filePageIds ).join( '|' ),
				formatversion: 2,
			} );
			for ( const page of response.query.pages ) {
				filePageIds[ page.title ] = page.pageid;
			}
		} );

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
			const entityId = `M${filePageIds[ file ]}`;
			const propertyId = wikibaseItemPropertyId;
			const value = itemId;
			// reset entity first
			await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} );
				done();
			}, entityId );

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addProperty( propertyId );

			const statementsWidget = await ACDC.statementsWidget( 1 );
			await statementsWidget.waitForDisplayed();

			await statementsWidget.addValue( value );

			await ACDC.submit();

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

		it( 'can add a single statement to two files', async () => {
			const file1 = 'File:ACDC test file 1.pdf';
			const file2 = 'File:ACDC test file 2.pdf';
			const entityId1 = `M${filePageIds[ file1 ]}`;
			const entityId2 = `M${filePageIds[ file2 ]}`;
			const propertyId = wikibaseItemPropertyId;
			const value = itemId;
			// reset entity first
			await browser.executeAsync( async ( entityId1, entityId2, done ) => {
				const api = new mediaWiki.Api();
				const promise1 = api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId1,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} );
				const promise2 = api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId2,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} );
				await Promise.all( [ promise1, promise2 ] );
				done();
			}, entityId1, entityId2 );

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file1 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.setFileInputValue( file2 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addProperty( propertyId );

			const statementsWidget = await ACDC.statementsWidget( 1 );
			await statementsWidget.waitForDisplayed();

			await statementsWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( /* ms: */ undefined, /* reverse: */ true );

			const [ entityData1, entityData2 ] = await browser.executeAsync(
				async ( entityId1, entityId2, done ) => {
					const api = new mediaWiki.Api();
					const entities = ( await api.get( {
						action: 'wbgetentities',
						ids: [ entityId1, entityId2 ],
					} ) ).entities;
					done( [ entities[ entityId1 ], entities[ entityId2 ] ] );
				},
				entityId1, entityId2
			);

			assert.strictEqual(
				entityData1.statements[ propertyId ][ 0 ].mainsnak.datavalue.value.id,
				value );
			assert.strictEqual(
				entityData2.statements[ propertyId ][ 0 ].mainsnak.datavalue.value.id,
				value );
		} );

		it( 'does not re-add an existing statement', async () => {
			const file = 'File:ACDC test file 1.pdf';
			const entityId = `M${filePageIds[ file ]}`;
			const propertyId = wikibaseItemPropertyId;
			const statementId = `${entityId}$ed9b7656-45c8-9fb2-cd03-3e3cd7e80b08`;
			const value = itemId;

			await browser.executeAsync( async ( entityId, propertyId, statementId, value, done ) => {
				const api = new mediaWiki.Api();
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'browser test setup',
					data: JSON.stringify( {
						labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } },
						claims: { [ propertyId ]: [ {
							type: 'statement',
							id: statementId,
							mainsnak: { snaktype: 'value', property: propertyId, datavalue: {
								type: 'wikibase-entityid',
								value: { 'entity-type': 'item', id: value },
							} },
						} ] },
					} ),
					clear: true,
				} );
				done();
			}, entityId, propertyId, statementId, value );

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addProperty( propertyId );

			const statementsWidget = await ACDC.statementsWidget( 1 );
			await statementsWidget.waitForDisplayed();

			await statementsWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( /* ms: */ undefined, /* reverse: */ true );
			const entityData = await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				done( ( await api.get( {
					action: 'wbgetentities',
					ids: entityId,
				} ) ).entities[ entityId ] );
			}, entityId );

			assert.strictEqual( entityData.statements[ propertyId ].length, 1 );
			assert.strictEqual( entityData.statements[ propertyId ][ 0 ].id, statementId );
		} );
	} );
} );
