const assert = require( 'assert' ),
	fs = require( 'fs' ).promises,
	process = require( 'process' ),
	MWBot = require( 'mwbot' ),
	ACDC = require( '../pageobjects/ACDC' ),
	MediaWiki = require( '../pageobjects/MediaWiki' ),
	{ searchTimeout, submitTimeout } = require( '../timeouts' );

const apiUrl = process.env.MEDIAWIKI_API_URL,
	indexUrl = process.env.MEDIAWIKI_INDEX_URL;

const bot = new MWBot( { apiUrl } );

describe( 'AC/DC', () => {
	let acdc,
		wikibaseItemPropertyId1 = process.env.MEDIAWIKI_WIKIBASE_ITEM_PROPERTY_ID_1,
		wikibaseItemPropertyId2 = process.env.MEDIAWIKI_WIKIBASE_ITEM_PROPERTY_ID_2,
		itemId1 = process.env.MEDIAWIKI_ITEM_ID_1,
		itemId2 = process.env.MEDIAWIKI_ITEM_ID_2;

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

	/**
	 * Open a blank page, inject AC/DC code and log in.
	 *
	 * @param {*} test The test on which to call `.skip()` if no credentials are available.
	 * Make sure your test function (or hook) is not an arrow function, and pass `this`.
	 */
	async function logIn( test ) {
		const username = process.env.MEDIAWIKI_USERNAME,
			password = process.env.MEDIAWIKI_PASSWORD;
		if ( username === undefined || password === undefined ) {
			test.skip();
		}

		await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en&acdcShow=1` );
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
	}

	/**
	 * Ensure wikibaseItemPropertyId1, wikibaseItemPropertyId2, itemId1 and itemId2 are set.
	 *
	 * @param {*} test The test on which to call `.skip()` if no credentials are available.
	 * Make sure your test function (or hook) is not an arrow function, and pass `this`.
	 * @return {boolean} Whether the function already called `logIn` or not.
	 * If false, all the environment variables were already
	 * so if the caller needs to be logged in then it should call the function itself.
	 * If true, we already logged in (or skip the test) and the caller does not need to do it again.
	 */
	async function setUpTestEntities( test ) {
		if ( wikibaseItemPropertyId1 && wikibaseItemPropertyId2 && itemId1 && itemId2 ) {
			return false;
		}

		await logIn( test );
		async function createItem( enLabel ) {
			const response = await browser.executeAsync( ( enLabel, done ) => {
				const api = new mediaWiki.Api();
				api.postWithEditToken( {
					action: 'wbeditentity',
					new: 'item',
					data: JSON.stringify( {
						labels: { en: { language: 'en', value: enLabel } },
					} ),
				} ).then( done, ( ...args ) => done( args ) );
			}, enLabel );
			if ( typeof response === 'object' && typeof response.entity === 'object' && typeof response.entity.id === 'string' ) {
				return response.entity.id;
			} else {
				throw new Error( JSON.stringify( response ) );
			}
		}
		async function createProperty( dataType, enLabel ) {
			const response = await browser.executeAsync( ( dataType, enLabel, done ) => {
				const api = new mediaWiki.Api();
				api.postWithEditToken( {
					action: 'wbeditentity',
					new: 'property',
					data: JSON.stringify( {
						datatype: dataType,
						labels: { en: { language: 'en', value: enLabel } },
					} ),
				} ).then( done, ( ...args ) => done( args ) );
			}, dataType, enLabel );
			if ( typeof response === 'object' && typeof response.entity === 'object' && typeof response.entity.id === 'string' ) {
				return response.entity.id;
			} else {
				throw new Error( JSON.stringify( response ) );
			}
		}

		/* eslint-disable es-x/no-logical-assignment-operators */
		wikibaseItemPropertyId1 ??= await createProperty( 'wikibase-item', 'AC/DC test item property 1' );
		wikibaseItemPropertyId2 ??= await createProperty( 'wikibase-item', 'AC/DC test item property 2' );
		itemId1 ??= await createItem( 'AC/DC test item 1' );
		itemId2 ??= await createItem( 'AC/DC test item 2' );
		/* eslint-enable */
		return true;
	}

	describe( 'default mode', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en&useskin=vector-2022` );
			await injectAcdc();
			await MediaWiki.ensureToolsShown();
		} );

		it( 'defines the portlet link and opens the dialog when clicking it', async () => {
			const portletLink = await ACDC.portletLink;
			await portletLink.waitForDisplayed( { timeoutMsg: 'expected portlet link to exist' } );
			assert.strictEqual( await portletLink.getText(), 'AC/DC',
				'portlet link text should be "AC/DC"' );

			await portletLink.click();
			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );
		} );
	} );

	describe( 'show-immediately mode', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en&acdcShow=1` );
			await injectAcdc();
		} );

		it( 'defines the portlet link and has already opened the dialog', async () => {
			const content = await ACDC.portletLink;
			// note: if the dialog is already opened, the link is not interactable
			// and we can’t use getText(), so use getHTML( false ) instead
			const html = await content.getHTML( false );
			assert.ok( html.includes( 'AC/DC' ),
				`portlet link HTML should include "AC/DC": ${ html }` );

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );
		} );
	} );

	describe( '“loaded” hook', () => {
		beforeEach( 'open blank page', async () => {
			await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en` );
		} );

		it( 'fires early-registered and late-registered hooks', async () => {
			await mediaWikiLoaded();
			await browser.execute( () => {
				mediaWiki.hook( 'gadget.acdc.loaded' ).add( () => {
					window.earlyHook = true;
				} );
			} );

			await injectAcdc();

			await browser.execute( () => {
				mediaWiki.hook( 'gadget.acdc.loaded' ).add( () => {
					window.lateHook = true;
				} );
			} );

			await browser.waitUntil(
				() => browser.execute( () => window.earlyHook === true && window.lateHook === true ),
				{ timeoutMsg: 'expected hook flags to be set' } );
		} );
	} );

	describe( 'FilesWidget', () => {
		beforeEach( 'open blank page and inject AC/DC code', async () => {
			await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en&acdcShow=1` );
			await injectAcdc();
			await ( await ACDC.dialog ).waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );
		} );

		it( 'supports various input formats', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1.pdf' );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf',
				'entered as full file name:' );
			await browser.keys( [ 'Backspace' ] );

			await ACDC.setFileInputValue( /* File: */ 'ACDC test file 1.pdf' );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf',
				'entered with missing File: prefix:' );
			await browser.keys( [ 'Backspace' ] );

			const [
				shortUrl, // “short” as in [[mw:Manual:Short URL]]
				defaultUrl,
				nonAsciiUrl,
			] = await browser.executeAsync( async done => {
				const relativeShortUrl = ( new mediaWiki.Title( 'File:ACDC test file 1.pdf' ) ).getUrl();
				const relativeDefaultUrl = ( new mediaWiki.Title( 'File:ACDC test file 1.pdf' ) )
					.getUrl( { action: 'view' } );
				const relativeNonAsciiUrl = ( new mediaWiki.Title( 'File:20000 тугрик.jpg' ) ).getUrl();
				const wgServer = mediaWiki.config.get( 'wgServer' );
				done( [
					wgServer + relativeShortUrl,
					wgServer + relativeDefaultUrl,
					wgServer + relativeNonAsciiUrl,
				] );
			} );

			await ACDC.setFileInputValue( shortUrl );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf',
				'entered as short URL:' );
			await browser.keys( [ 'Backspace' ] );

			await ACDC.setFileInputValue( defaultUrl );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:ACDC test file 1.pdf',
				'entered as default URL:' );
			await browser.keys( [ 'Backspace' ] );

			await ACDC.setFileInputValue( nonAsciiUrl );
			await browser.keys( [ 'Enter' ] );
			assert.strictEqual( await ACDC.tagItemText( 1 ), 'File:20000 тугрик.jpg',
				'entered as non-ASCII URL:' );
			await browser.keys( [ 'Backspace' ] );
		} );

		it( 'supports autocompletion', async () => {
			await ACDC.setFileInputValue( 'File:ACDC test file 1' /* .pdf */ );
			const menu = await $( '.oo-ui-lookupElement-menu' );
			await menu.waitForDisplayed( { timeout: searchTimeout, timeoutMsg: 'expected lookup menu to be opened' } );
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
		before( 'set up test entities', async function () {
			await setUpTestEntities( this );
		} );

		it( 'registers favorite properties (to add and remove)', async () => {
			await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en&acdcShow=1` );
			await injectAcdc( {
				acdcFavoriteProperties: [ wikibaseItemPropertyId1 ],
				acdcEnableRemoveFeature: true, // temporary
			} );
			await ( await ACDC.dialog ).waitForDisplayed( { timeout: searchTimeout, timeoutMsg: 'expected AC/DC to be opened' } );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to add' } );

			const propertyIdToAdd = await statementToAddWidget.propertyId;
			assert.strictEqual( propertyIdToAdd, wikibaseItemPropertyId1 );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to remove' } );

			const propertyIdToRemove = await statementToRemoveWidget.propertyId;
			assert.strictEqual( propertyIdToRemove, wikibaseItemPropertyId1 );
		} );

		it( 'registers favorite properties to add and to remove (separately)', async () => {
			await browser.url( `${ indexUrl }?title=Special:BlankPage&uselang=en&acdcShow=1` );
			await injectAcdc( {
				acdcFavoritePropertiesToAdd: [ wikibaseItemPropertyId1 ],
				acdcFavoritePropertiesToRemove: [ wikibaseItemPropertyId2 ],
				acdcEnableRemoveFeature: true, // temporary
			} );
			await ( await ACDC.dialog ).waitForDisplayed( { timeout: searchTimeout, timeoutMsg: 'expected AC/DC to be opened' } );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to add' } );

			const propertyIdToAdd = await statementToAddWidget.propertyId;
			assert.strictEqual( propertyIdToAdd, wikibaseItemPropertyId1 );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to remove' } );

			const propertyIdToRemove = await statementToRemoveWidget.propertyId;
			assert.strictEqual( propertyIdToRemove, wikibaseItemPropertyId2 );
		} );

	} );

	describe( 'statements', () => {
		const filePageIds = { // initialized in before() hook
			'File:ACDC test file 1.pdf': -1,
			'File:ACDC test file 2.pdf': -1,
		};

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

		beforeEach( 'set up test entities, open blank page, inject AC/DC code and log in', async function () {
			const loggedIn = await setUpTestEntities( this );
			if ( !loggedIn ) {
				await logIn( this );
			}
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
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId1,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				await api.postWithEditToken( {
					action: 'wbeditentity',
					id: entityId2,
					summary: 'clear for browser test',
					data: JSON.stringify( { labels: { en: { value: 'test file for the AC/DC gadget', language: 'en' } } } ),
					clear: true,
				} ).catch( ( ...args ) => {
					done( JSON.stringify( args ) );
					throw args;
				} );
				done();
			}, entityId1, entityId2 );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );

			await ACDC.setFileInputValue( file1 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.setFileInputValue( file2 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToAdd( propertyId );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to add' } );

			await statementToAddWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: 2 * submitTimeout, reverse: true, timeoutMsg: 'expected AC/DC to be closed' } );

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
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToAdd( propertyId );

			const statementToAddWidget = await ACDC.statementToAddWidget( 1 );
			await statementToAddWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to add' } );

			await statementToAddWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: submitTimeout, reverse: true, timeoutMsg: 'expected AC/DC to be closed' } );
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
				await api.postWithEditToken( {
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
				await api.postWithEditToken( {
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
				done();
			}, entityId1, entityId2, propertyId, statementId1, statementId2, value );
			if ( error ) {
				throw new Error( error );
			}

			const dialog = await ACDC.dialog;
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );

			await ACDC.setFileInputValue( file1 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.setFileInputValue( file2 );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to remove' } );

			await statementToRemoveWidget.addValue( value );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: 2 * submitTimeout, reverse: true, timeoutMsg: 'expected AC/DC to be closed' } );

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
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId1 );

			const statementToRemoveWidget1 = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget1.waitForDisplayed( { timeoutMsg: 'expected widget for first statement to remove' } );

			await statementToRemoveWidget1.addValue( value1 );
			await statementToRemoveWidget1.addValue( value2 );

			await ACDC.addPropertyToRemove( propertyId2 );

			const statementToRemoveWidget2 = await ACDC.statementToRemoveWidget( 2 );
			await statementToRemoveWidget2.waitForDisplayed( { timeoutMsg: 'expected widget for second statement to remove' } );

			await statementToRemoveWidget2.addValue( value1 );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: 3 * submitTimeout, reverse: true, timeoutMsg: 'expected AC/DC to be closed' } );
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
			await dialog.waitForDisplayed( { timeoutMsg: 'expected AC/DC to be opened' } );

			await ACDC.setFileInputValue( file );
			await browser.keys( [ 'Enter' ] );

			await ACDC.addPropertyToRemove( propertyId1 );

			const statementToRemoveWidget = await ACDC.statementToRemoveWidget( 1 );
			await statementToRemoveWidget.waitForDisplayed( { timeoutMsg: 'expected widget for statement to remove' } );

			await statementToRemoveWidget.addValue( value1 );

			await ACDC.submit();

			// wait until no longer displayed ⇒ done
			await dialog.waitForDisplayed( { timeout: submitTimeout, reverse: true, timeoutMsg: 'expected AC/DC to be closed' } );
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
