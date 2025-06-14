const assert = require( 'assert' ),
	fs = require( 'fs' ).promises,
	process = require( 'process' ),
	MWBot = require( 'mwbot' ),
	wdioConf = require( '../../../wdio.conf' ),
	ACDC = require( '../pageobjects/ACDC' ),
	MediaWiki = require( '../pageobjects/MediaWiki' );

const bot = new MWBot( { apiUrl: `${ wdioConf.config.baseUrl }/w/api.php` } );

const ACDC_SUBMIT_TIMEOUT = 60000;

describe( 'AC/DC', () => {
	let acdc;

	before( 'load AC/DC code from disk', async () => {
		acdc = await fs.readFile( 'acdc.js', { encoding: 'utf8' } );
	} );

	// call this after loading a page
	async function installGlobalErrorHandler() {
		await browser.execute( () => {
			window.addEventListener( 'error', error => {
				window.acdcGlobalError = error;
			} );
		} );
	}

	afterEach( 'check global error handler', async function () {
		const acdcGlobalErrorMessage = await browser.execute( () => {
			const acdcGlobalError = window.acdcGlobalError;
			delete window.acdcGlobalError;
			if ( acdcGlobalError !== undefined ) {
				debugger; // eslint-disable-line no-debugger
				return acdcGlobalError.message;
			} else {
				return null;
			}
		} );
		if ( acdcGlobalErrorMessage !== null ) {
			this.test.error( new Error( `Client-side (in-browser) error: ${ acdcGlobalErrorMessage }` ) );
		}
	} );

	async function mediaWikiLoaded() {
		await browser.waitUntil( () => browser.execute(
			() => window.mediaWiki !== undefined &&
				window.jQuery !== undefined &&
				window.mediaWiki.loader.using !== undefined ) );
	}

	async function injectAcdc( windowAssignments = {} ) {
		await mediaWikiLoaded();
		await browser.execute( windowAssignments => {
			delete window.acdcFavoriteProperties;
			delete window.acdcFavoritePropertiesToAdd;
			delete window.acdcFavoritePropertiesToRemove;
			delete window.acdcEnableRemoveFeature;
			for ( const [ key, value ] of Object.entries( windowAssignments ) ) {
				window[ key ] = value;
			}
		}, windowAssignments );
		await browser.execute( acdc );

		// now is a good time to install the global error handler, too
		await installGlobalErrorHandler();
	}

	describe( 'default mode', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&useskin=vector-2022' );
			await injectAcdc();
			await MediaWiki.ensureToolsShown();
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

	describe( '“loaded” hook', () => {
		beforeEach( 'open blank page', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en' );
		} );

		it( 'fires early-registered hook', async () => {
			await mediaWikiLoaded();
			await browser.execute( () => {
				mediaWiki.hook( 'gadget.acdc.loaded' ).add( () => {
					window.acdcLoaded = true;
				} );
			} );

			await injectAcdc();

			await browser.waitUntil( () => browser.execute(
				() => window.acdcLoaded === true ) );
		} );

		it( 'fires late-registered hook', async () => {
			await injectAcdc();

			await browser.execute( () => {
				mediaWiki.hook( 'gadget.acdc.loaded' ).add( () => {
					window.acdcLoaded = true;
				} );
			} );

			await browser.waitUntil( () => browser.execute(
				() => window.acdcLoaded === true ) );
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

		it( 'parses short URL', async () => { // “short” as in [[mw:Manual:Short URL]]
			const url = await browser.executeAsync( async done => {
				const relativeUrl = ( new mediaWiki.Title( 'File:ACDC test file 1.pdf' ) ).getUrl();
				done( mediaWiki.config.get( 'wgServer' ) + relativeUrl );
			} );
			await ACDC.setFileInputValue( url );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
		} );

		it( 'parses default URL', async () => {
			const url = await browser.executeAsync( async done => {
				const relativeUrl = ( new mediaWiki.Title( 'File:ACDC test file 1.pdf' ) )
					.getUrl( { action: 'view' } );
				done( mediaWiki.config.get( 'wgServer' ) + relativeUrl );
			} );
			await ACDC.setFileInputValue( url );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
		} );

		it( 'parses non-ASCII URL', async () => {
			const url = await browser.executeAsync( async done => {
				const relativeUrl = ( new mediaWiki.Title( 'File:20000 тугрик.jpg' ) ).getUrl();
				done( mediaWiki.config.get( 'wgServer' ) + relativeUrl );
			} );
			await ACDC.setFileInputValue( url );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:20000 тугрик.jpg' );
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

		it( 'does nothing on pipe as input', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1.pdf' );
			await browser.keys( [ 'Enter' ] );
			await ACDC.setFileInputValue( '|' );
			// we’re not really interested in behavior here,
			// but this used to produce console errors: T279852
			await browser.keys( [ 'Enter' ] );
			await ACDC.setFileInputValue( 'File:ACDC test file 2.pdf' );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf' );
			assert.strictEqual( await ACDC.tagItemText( 2 ), 'File:ACDC test file 2.pdf' );
		} );
	} );

	describe( 'favorite properties', () => {
		const wikibaseItemPropertyId = 'P734';

		it( 'registers favorite properties (to add and remove)', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc( {
				acdcFavoriteProperties: [ wikibaseItemPropertyId ],
				acdcEnableRemoveFeature: true, // temporary
			} );
			await ( await ACDC.dialog ).waitForDisplayed();

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed();

			const propertyIdToAdd = await statementToAddWidget.propertyId;
			assert.strictEqual( propertyIdToAdd, wikibaseItemPropertyId );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed();

			const propertyIdToRemove = await statementToRemoveWidget.propertyId;
			assert.strictEqual( propertyIdToRemove, wikibaseItemPropertyId );
		} );

		it( 'registers favorite properties to add', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc( {
				acdcFavoritePropertiesToAdd: [ wikibaseItemPropertyId ],
			} );
			await ( await ACDC.dialog ).waitForDisplayed();

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed();

			const propertyIdToAdd = await statementToAddWidget.propertyId;
			assert.strictEqual( propertyIdToAdd, wikibaseItemPropertyId );
		} );

		it( 'registers favorite properties to remove', async () => {
			await browser.url( '/wiki/Special:BlankPage?uselang=en&acdcShow=1' );
			await injectAcdc( {
				acdcFavoritePropertiesToRemove: [ wikibaseItemPropertyId ],
				acdcEnableRemoveFeature: true, // temporary
			} );
			await ( await ACDC.dialog ).waitForDisplayed();

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed();

			const propertyIdToRemove = await statementToRemoveWidget.propertyId;
			assert.strictEqual( propertyIdToRemove, wikibaseItemPropertyId );
		} );

	} );

	describe( 'statements', () => {
		const filePageIds = { // initialized in before() hook
			'File:ACDC test file 1.pdf': -1,
			'File:ACDC test file 2.pdf': -1,
		};
		const wikibaseItemPropertyId1 = 'P734';
		const wikibaseItemPropertyId2 = 'P116'; // NOTE: not an Item property on Wikidata
		const itemId1 = 'Q15';
		const itemId2 = 'Q21';

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
			await injectAcdc( {
				acdcFavoriteProperties: [],
				acdcEnableRemoveFeature: true, // temporary
			} );

			const error = await browser.executeAsync( async ( username, password, done ) => {
				const api = new mediaWiki.Api();
				let response = await api.get( {
					action: 'query',
					meta: [ 'tokens', 'userinfo' ],
					type: 'login',
				} );
				if ( response.query.userinfo.name === username ) {
					// already logged in
					mediaWiki.config.set( 'wgUserName', username );
					done( null );
					return;
				}
				const token = response.query.tokens.logintoken;
				response = await api.post( {
					action: 'login',
					lgname: username,
					lgpassword: password,
					lgtoken: token,
				} );
				if ( response.login.lgusername !== username ) {
					// If lgusername !== username, we may be logged in now,
					// but we won’t be able to detect “already logged in” above
					// for the next test run, so better to fail here.
					let reason = `Expected to log in as ${ username } but returned ${ response.login.lgusername }.`;
					reason += '\nIf using a bot password, please use the form username / appid@password';
					reason += ' rather than username@appid / password.';
					if ( response.login.reason ) {
						reason += '\n' + response.login.reason;
					}
					done( reason );
				} else {
					mediaWiki.config.set( 'wgUserName', username );
					done( null );
				}
			}, username, password );
			if ( error ) {
				throw new Error( error );
			}
		} );

		it( 'can add a single statement', async () => {
			const file = 'File:ACDC test file 1.pdf';
			const entityId = `M${ filePageIds[ file ] }`;
			const propertyId = wikibaseItemPropertyId1;
			const value = itemId1;
			// reset entity first
			const error = await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				done();
			}, entityId );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToAdd( propertyId );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed();

			await statementToAddWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: ACDC_SUBMIT_TIMEOUT, reverse: true } );
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
			const entityId1 = `M${ filePageIds[ file1 ] }`;
			const entityId2 = `M${ filePageIds[ file2 ] }`;
			const propertyId = wikibaseItemPropertyId1;
			const value = itemId1;
			// reset entity first
			const error = await browser.executeAsync( async ( entityId1, entityId2, done ) => {
				const api = new mediaWiki.Api();
				const promise1 = api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId1,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				const promise2 = api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId2,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				await Promise.all( [ promise1, promise2 ] );
				done();
			}, entityId1, entityId2 );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file1 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.setFileInputValue( file2 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToAdd( propertyId );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed();

			await statementToAddWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: 2 * ACDC_SUBMIT_TIMEOUT, reverse: true } );

			const [ entityData1, entityData2 ] = await browser.executeAsync(
				async ( entityId1, entityId2, done ) => {
					const api = new mediaWiki.Api();
					const entities = ( await api.get( {
						action: 'wbgetentities',
						ids: [ entityId1, entityId2 ],
					} ) ).entities;
					done( [ entities[ entityId1 ], entities[ entityId2 ] ] );
				},
				entityId1, entityId2,
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
			const entityId = `M${ filePageIds[ file ] }`;
			const propertyId = wikibaseItemPropertyId1;
			const statementId = `${ entityId }$ed9b7656-45c8-9fb2-cd03-3e3cd7e80b08`;
			const value = itemId1;

			const error = await browser.executeAsync( async ( entityId, propertyId, statementId, value, done ) => {
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
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				done();
			}, entityId, propertyId, statementId, value );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToAdd( propertyId );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed();

			await statementToAddWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: ACDC_SUBMIT_TIMEOUT, reverse: true } );
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

		it( 'can remove a single statement', async () => {
			const file = 'File:ACDC test file 1.pdf';
			const entityId = `M${ filePageIds[ file ] }`;
			const propertyId = wikibaseItemPropertyId1;
			const statementId = `${ entityId }$e7a7a919-e727-49d3-bfe3-2bc6e1eb5fc7`;
			const value = itemId1;

			const error = await browser.executeAsync( async ( entityId, propertyId, statementId, value, done ) => {
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
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				done();
			}, entityId, propertyId, statementId, value );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed();

			await statementToRemoveWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: ACDC_SUBMIT_TIMEOUT, reverse: true } );
			const entityData = await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				done( ( await api.get( {
					action: 'wbgetentities',
					ids: entityId,
				} ) ).entities[ entityId ] );
			}, entityId );

			assert.deepStrictEqual( entityData.statements, [] ); // should be {} but see T222159
		} );

		it( 'can remove a single statement from two files', async () => {
			const file1 = 'File:ACDC test file 1.pdf';
			const file2 = 'File:ACDC test file 2.pdf';
			const entityId1 = `M${ filePageIds[ file1 ] }`;
			const entityId2 = `M${ filePageIds[ file2 ] }`;
			const propertyId = wikibaseItemPropertyId1;
			const statementId1 = `${ entityId1 }$7656a423-af3a-4c94-8b87-bd559931e60a`;
			const statementId2 = `${ entityId2 }$1f67af57-36d9-46a6-ac8d-b20d44f7aed9`;
			const value = itemId1;

			const error = await browser.executeAsync( async ( entityId1, entityId2, propertyId, statementId1, statementId2, value, done ) => {
				const api = new mediaWiki.Api();
				const promise1 = api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId1,
					summary: 'browser test setup',
					data: JSON.stringify( {
						labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } },
						claims: { [ propertyId ]: [ {
							type: 'statement',
							id: statementId1,
							mainsnak: { snaktype: 'value', property: propertyId, datavalue: {
								type: 'wikibase-entityid',
								value: { 'entity-type': 'item', id: value },
							} },
						} ] },
					} ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				const promise2 = api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId2,
					summary: 'browser test setup',
					data: JSON.stringify( {
						labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } },
						claims: { [ propertyId ]: [ {
							type: 'statement',
							id: statementId2,
							mainsnak: { snaktype: 'value', property: propertyId, datavalue: {
								type: 'wikibase-entityid',
								value: { 'entity-type': 'item', id: value },
							} },
						} ] },
					} ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				await Promise.all( [ promise1, promise2 ] );
				done();
			}, entityId1, entityId2, propertyId, statementId1, statementId2, value );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file1 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.setFileInputValue( file2 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed();

			await statementToRemoveWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: 2 * ACDC_SUBMIT_TIMEOUT, reverse: true } );

			const [ entityData1, entityData2 ] = await browser.executeAsync(
				async ( entityId1, entityId2, done ) => {
					const api = new mediaWiki.Api();
					const entities = ( await api.get( {
						action: 'wbgetentities',
						ids: [ entityId1, entityId2 ],
					} ) ).entities;
					done( [ entities[ entityId1 ], entities[ entityId2 ] ] );
				},
				entityId1, entityId2,
			);

			assert.deepStrictEqual( entityData1.statements, [] ); // should be {} but see T222159
			assert.deepStrictEqual( entityData2.statements, [] ); // should be {} but see T222159
		} );

		it( 'can remove multiple statements', async () => {
			const file = 'File:ACDC test file 1.pdf';
			const entityId = `M${ filePageIds[ file ] }`;
			const propertyId1 = wikibaseItemPropertyId1;
			const propertyId2 = wikibaseItemPropertyId2;
			const statementId1 = `${ entityId }$fb7806eb-076e-47ad-9171-448b6dd5878b`;
			const statementId2 = `${ entityId }$ec941087-695f-41cc-b0cd-459827425c58`;
			const statementId3 = `${ entityId }$0717cf93-cc74-4ca9-b434-21209ce935d0`;
			const value1 = itemId1;
			const value2 = itemId2;

			const error = await browser.executeAsync( async ( entityId, propertyId1, propertyId2, statementId1, statementId2, statementId3, value1, value2, done ) => {
				const api = new mediaWiki.Api();
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'browser test setup',
					data: JSON.stringify( {
						labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } },
						claims: {
							[ propertyId1 ]: [
								{
									type: 'statement',
									id: statementId1,
									mainsnak: { snaktype: 'value', property: propertyId1, datavalue: {
										type: 'wikibase-entityid',
										value: { 'entity-type': 'item', id: value1 },
									} },
								},
								{
									type: 'statement',
									id: statementId2,
									mainsnak: { snaktype: 'value', property: propertyId1, datavalue: {
										type: 'wikibase-entityid',
										value: { 'entity-type': 'item', id: value2 },
									} },
								},
							],
							[ propertyId2 ]: [ {
								type: 'statement',
								id: statementId3,
								mainsnak: { snaktype: 'value', property: propertyId2, datavalue: {
									type: 'wikibase-entityid',
									value: { 'entity-type': 'item', id: value1 },
								} },
							} ],
						},
					} ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				done();
			}, entityId, propertyId1, propertyId2, statementId1, statementId2, statementId3, value1, value2 );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId1 );

			const statementToRemoveWidget1 = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget1.waitForDisplayed();

			await statementToRemoveWidget1.addValue( value1 );
			await statementToRemoveWidget1.addValue( value2 );

			await ACDC.addPropertyToRemove( propertyId2 );

			const statementToRemoveWidget2 = await ACDC.statementToRemoveWidget( 2 );
			await statementToRemoveWidget2.waitForDisplayed();

			await statementToRemoveWidget2.addValue( value1 );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: 3 * ACDC_SUBMIT_TIMEOUT, reverse: true } );
			const entityData = await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				done( ( await api.get( {
					action: 'wbgetentities',
					ids: entityId,
				} ) ).entities[ entityId ] );
			}, entityId );

			assert.deepStrictEqual( entityData.statements, [] ); // should be {} but see T222159
		} );

		it( 'does not remove other statements', async () => {
			const file = 'File:ACDC test file 1.pdf';
			const entityId = `M${ filePageIds[ file ] }`;
			const propertyId1 = wikibaseItemPropertyId1;
			const propertyId2 = wikibaseItemPropertyId2;
			const statementId1 = `${ entityId }$fb7806eb-076e-47ad-9171-448b6dd5878b`;
			const statementId2 = `${ entityId }$ec941087-695f-41cc-b0cd-459827425c58`;
			const statementId3 = `${ entityId }$0717cf93-cc74-4ca9-b434-21209ce935d0`;
			const value1 = itemId1;
			const value2 = itemId2;

			const error = await browser.executeAsync( async ( entityId, propertyId1, propertyId2, statementId1, statementId2, statementId3, value1, value2, done ) => {
				const api = new mediaWiki.Api();
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId,
					summary: 'browser test setup',
					data: JSON.stringify( {
						labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } },
						claims: {
							[ propertyId1 ]: [
								{
									type: 'statement',
									id: statementId1,
									mainsnak: { snaktype: 'value', property: propertyId1, datavalue: {
										type: 'wikibase-entityid',
										value: { 'entity-type': 'item', id: value1 },
									} },
								},
								{
									type: 'statement',
									id: statementId2,
									mainsnak: { snaktype: 'value', property: propertyId1, datavalue: {
										type: 'wikibase-entityid',
										value: { 'entity-type': 'item', id: value2 },
									} },
								},
							],
							[ propertyId2 ]: [ {
								type: 'statement',
								id: statementId3,
								mainsnak: { snaktype: 'value', property: propertyId2, datavalue: {
									type: 'wikibase-entityid',
									value: { 'entity-type': 'item', id: value1 },
								} },
							} ],
						},
					} ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				done();
			}, entityId, propertyId1, propertyId2, statementId1, statementId2, statementId3, value1, value2 );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed();

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId1 );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed();

			await statementToRemoveWidget.addValue( value1 );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: ACDC_SUBMIT_TIMEOUT, reverse: true } );
			const entityData = await browser.executeAsync( async ( entityId, done ) => {
				const api = new mediaWiki.Api();
				done( ( await api.get( {
					action: 'wbgetentities',
					ids: entityId,
				} ) ).entities[ entityId ] );
			}, entityId );

			assert.strictEqual( entityData.statements[ propertyId1 ].length, 1 );
			assert.strictEqual( entityData.statements[ propertyId1 ][ 0 ].id, statementId2 );
			assert.strictEqual( entityData.statements[ propertyId1 ][ 0 ].mainsnak.datavalue.value.id, value2 );
			assert.strictEqual( entityData.statements[ propertyId2 ].length, 1 );
			assert.strictEqual( entityData.statements[ propertyId2 ][ 0 ].id, statementId3 );
			assert.strictEqual( entityData.statements[ propertyId2 ][ 0 ].mainsnak.datavalue.value.id, value1 );
		} );
	} );
} );
