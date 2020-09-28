( async function ( mw, $ ) {
	'use strict';

	const require = await mw.loader.using( [
			'oojs',
			'oojs-ui-core',
			'oojs-ui-widgets',
			'oojs-ui-windows',
			'oojs-ui.styles.icons-interactions',
			'oojs-ui.styles.icons-content',
			'oojs-ui.styles.icons-editing-list',
			'wikibase.mediainfo.statements',
			'wikibase.utilities.ClaimGuidGenerator',
			'wikibase.datamodel',
			'wikibase.serialization',
			'mediawiki.api',
			'mediawiki.util',
			'mediawiki.Title',
			'jquery.i18n',
		] ),
		ClaimGuidGenerator = wikibase.utilities.ClaimGuidGenerator,
		{ Statement, Claim, PropertyNoValueSnak } = require( 'wikibase.datamodel' ),
		{ StatementListDeserializer, StatementSerializer, StatementDeserializer } = require( 'wikibase.serialization' ),
		{ StatementWidget, AddPropertyWidget } = require( 'wikibase.mediainfo.statements' );

	await $.i18n().load( {
		en: {
			'gadget-acdc-load-category': 'Load category',
			'gadget-acdc-load-pagepile': 'Load PagePile',
			'gadget-acdc-load-category-title': 'Category title:',
			'gadget-acdc-load-category-placeholder': 'Category:Example',
			'gadget-acdc-load-pagepile-id': 'PagePile ID:',
			'gadget-acdc-load-pagepile-error-wrong-wiki': 'That PagePile does not belong to this wiki!',
			'gadget-acdc-load-pagepile-warning-large-pagepile':
				'This PagePile contains {{PLURAL:$1|$1 file|$1 files}}, ' +
				'using it will take a while. Are you sure?',
			'gadget-acdc-button-stop-edit': 'Stop',
			'gadget-acdc-field-files': 'Files to edit',
			'gadget-acdc-field-statements-to-add': 'Statements to add',
			'gadget-acdc-field-statements-to-remove': 'Statements to remove',
			'gadget-acdc-file-placeholder': 'File:Example.png',
			'gadget-acdc-files-placeholder': 'File:Example.png | File:Example.jpg',
			'gadget-acdc-error-duplicate-statements-to-add':
				'You specified multiple statements with the same main value, ' +
				'which is not supported. ' +
				'If you need to make multiple changes to one statement, merge them. ' +
				'If you really need to add multiple statements with the same value, ' +
				'you’ll have to find another way (sorry).',
			'gadget-acdc-error-duplicate-statements-to-remove':
				'You specified multiple statements to remove with the same main value, ' +
				'which is not supported.',
			'gadget-acdc-error-statement-with-qualifiers-to-remove':
				'You specified a statement with qualifiers ' +
				'in the “{{int:gadget-acdc-field-statements-to-remove}}” section. ' +
				'The meaning of this is not clear ' +
				'(remove only qualifiers, or remove whole statement only if it has these qualifiers?), ' +
				'so this is currenty not supported.',
			// TODO implement the following error
			'gadget-acdc-error-statement-to-add-and-remove':
				'You specified statements with the same property and value ' +
				'in the “{{int:gadget-acdc-field-statements-to-add}}” and ' +
				'“{{int:gadget-acdc-field-statements-to-remove}}” sections. ' +
				'The meaning of this is not clear, so it is currently not supported.',
		},
	} );
	await $.i18n().load(
		new mw.Title( 'MediaWiki:Gadget-ACDC-i18n.json' ).getUrl() +
			'?action=raw&ctype=application/json',
		// note: we can’t pass the parameters into getUrl() –
		// we need a URL that ends in .json (otherwise $.i18n thinks it’s a directory),
		// so it has to be /wiki/….json?action=…, not /w/index.php?title=….json&action=…
		// (and yes, this means the i18n only works on wikis with nice URLs)
	);
	// implement {{int:}}, see https://github.com/wikimedia/jquery.i18n/issues/211
	$.extend( $.i18n.parser.emitter, {
		int( nodes ) {
			return $.i18n( ...nodes );
		},
	} );

	/**
	 * Maps titles to entity IDs.
	 *
	 * @param {string[]} titles
	 * @return {Promise<Object.<string,string>>} map from title to entity ID
	 */
	async function titlesToEntityIds( titles ) {
		const api = new mw.Api(),
			allTitles = titles.slice(), // copy that we can splice without affecting the original
			entityIds = {};
		let someTitles;
		while ( ( someTitles = allTitles.splice( 0, 50 ) ).length > 0 ) {
			const response = await api.post( { // POST because titles list may be too long for GET URL
				action: 'query',
				titles: someTitles,
				formatversion: 2,
			} );
			for ( const page of response.query.pages ) {
				entityIds[ page.title ] = `M${page.pageid}`;
			}
		}
		return entityIds;
	}

	/**
	 * Maps entity IDs to entity data.
	 *
	 * @param {string[]} entityIds
	 * @param {string[]} props
	 * @return {Promise<Object.<string,Object>>} map from entity ID to entity data
	 */
	async function entityIdsToData( entityIds, props ) {
		const api = new mw.Api(),
			allEntityIds = entityIds.slice(), // copy that we can splice without affecting the original
			entityData = {};
		let someEntityIds;
		while ( ( someEntityIds = allEntityIds.splice( 0, 50 ) ).length > 0 ) {
			const response = await api.get( { action: 'wbgetentities', ids: someEntityIds, props, formatversion: 2 } );
			Object.assign( entityData, response.entities );
		}
		for ( const data of Object.values( entityData ) ) {
			if ( 'missing' in data ) {
				// treat missing entities (i. e. no structured data yet) as having empty statements
				data.statements = {};
			}
		}
		return entityData;
	}

	async function* categoryFiles( categoryTitle ) {
		const api = new mw.Api(),
			originalParams = {
				action: 'query',
				list: 'categorymembers',
				cmtitle: categoryTitle,
				cmprop: [ 'title' ],
				cmtype: [ 'file' ],
				cmlimit: 'max',
				formatversion: 2,
			};
		let response = {};
		do {
			response = await api.get( Object.assign( {}, originalParams, response.continue ) );
			yield* response.query.categorymembers.map( member => member.title );
		} while ( 'continue' in response );
	}

	/**
	 * Return the datatypes of the properties with the given IDs.
	 *
	 * @param {Array.<string>} propertyIds
	 * @return {Promise<Object.<string,string>>}
	 */
	async function propertyDatatypes( propertyIds ) {
		if ( !propertyIds.length ) {
			return {};
		}
		const api = new mw.Api(),
			response = await api.get( {
				action: 'wbgetentities',
				ids: propertyIds,
				props: [ 'datatype' ],
				formatversion: 2,
			} );
		return Object.fromEntries(
			Object.entries( response.entities )
				.map( ( [ propertyId, { datatype } ] ) => [ propertyId, datatype ] ) );
	}

	/**
	 * Sleep for a tiny bit, to give the browser time to update the UI.
	 * Usually called in busy loops that would otherwise block for a while, freezing the browser.
	 * Calling this may slow down the process a bit, but is much more responsive.
	 *
	 * @return {Promise}
	 */
	function microsleep() {
		return new Promise( resolve => setTimeout( resolve, 1 ) );
	}

	function failSanityCheck( component ) {
		throw new Error( `${component} seems to have changed incompatibly, AC/DC must be updated before it can be safely used!` );
	}

	function sanityCheckStatementWidgetPropertyId() {
		const statementWidget = new StatementWidget( {
			entityId: '',
			propertyId: 'P12345',
			isDefaultProperty: false,
			propertyType: 'wikibase-item',
		} );
		if ( !( 'state' in statementWidget &&
				statementWidget.state.propertyId === 'P12345' ) ) {
			// if the property ID is not available, we can’t detect existing statements
			failSanityCheck( 'StatementWidget.state.propertyId' );
		}
	}

	function sanityCheckStatementEquals() {
		const snak = new PropertyNoValueSnak( 'P1' ),
			claim1 = new Claim( snak, null, 'guid 1' ),
			statement1 = new Statement( claim1 ),
			claim2 = new Claim( snak, null, 'guid 2' ),
			statement2 = new Statement( claim2 );
		if ( !statement1.equals( statement2 ) ) {
			// if different GUIDs break Statement.equals, we can’t detect duplicate statements
			failSanityCheck( 'Statement.equals' );
		}
	}

	sanityCheckStatementWidgetPropertyId();
	sanityCheckStatementEquals();

	let installedStyles = false;
	function installStyles() {
		if ( installedStyles ) {
			return;
		}

		const style = document.createElement( 'style' );
		// TODO better way to indicate errors
		style.innerHTML = `
.acdc-statementsDialog__statementWidget--duplicate-statement,
.acdc-statementsDialog__statementWidget--statement-with-qualifiers-to-remove,
.acdc-statementsDialog__statementWidget--statement-to-add-and-remove {
	border-left: 2px solid red;
}
`;
		const now = new Date();
		if ( ( now.getMonth() + 1 ) === 9 && now.getDate() === 23 ) {
			style.innerHTML += `
.acdc-statementsDialog .oo-ui-processDialog-actions-primary .oo-ui-widget-enabled .oo-ui-buttonElement-button {
	background: linear-gradient( #D60270 40%, #9B4F96 40%, 60%, #0038A8 60% );
}
`;
		}

		document.head.appendChild( style );
		installedStyles = true;
	}

	function ensureFileNamespace( title ) {
		if ( title.startsWith( 'File:' ) ) {
			return title;
		} else {
			return `File:${title}`;
		}
	}

	/**
	 * FileInputWidget is an input widget for files on the local wiki.
	 * File names are looked up as soon as the user begins typing,
	 * and suggested accordingly.
	 * When text is pasted into the input,
	 * newline and tab characters are replaced with pipe characters,
	 * for integration with FilesWidget.
	 *
	 * @class
	 * @extends OO.ui.TextInputWidget
	 * @mixins OO.ui.mixin.LookupElement
	 *
	 * @constructor
	 * @param {Object} [config] Configuration options
	 * @cfg {string[]} [skippedFiles] Don’t suggest these files in the lookup.
	 */
	function FileInputWidget( config ) {
		FileInputWidget.super.call( this, $.extend( {
			placeholder: $.i18n( 'gadget-acdc-file-placeholder' ),
		}, config ) );
		OO.ui.mixin.LookupElement.call( this, $.extend( {
			showPendingRequest: false,
			$container: this.$input, // the default is this.$element, which in a non-'outline' TagMultiselectWidget is never attached to the DOM, so the lookup can’t position itself relative to it
		}, config ) );
		this.skippedFiles = config.skippedFiles || [];
		this.$element.addClass( 'acdc-fileInputWidget' );
		this.$input.addClass( 'acdc-fileInputWidget-input' );
		this.lookupMenu.connect( this, { choose: [ 'emit', 'select' ] } );
		this.$input.on( 'paste', ( { originalEvent: clipboardEvent } ) => {
			const value = clipboardEvent.clipboardData.getData( 'text' )
					.trim()
					.replace( /[\n\t]/g, ' | ' ),
				inputElement = this.$input[ 0 ];

			if ( typeof inputElement.setRangeText === 'function' ) {
				inputElement.setRangeText( value );
				inputElement.selectionStart += value.length;
				inputElement.selectionEnd = inputElement.selectionStart;
			} else {
				// fallback for incompatible browsers
				inputElement.value = value;
			}

			clipboardEvent.preventDefault();
		} );
	}
	OO.inheritClass( FileInputWidget, OO.ui.TextInputWidget );
	OO.mixinClass( FileInputWidget, OO.ui.mixin.LookupElement );
	FileInputWidget.prototype.setSkippedFiles = function ( skippedFiles ) {
		this.skippedFiles = skippedFiles;
	};
	FileInputWidget.prototype.getLookupRequest = function () {
		const prefix = this.getValue();
		if ( !prefix || prefix.indexOf( '|' ) !== -1 ) {
			return $.Deferred().resolve( [] ).promise();
		}

		const api = new mw.Api();
		return api.get( {
			action: 'query',
			list: 'search',
			srsearch: `prefix:${ensureFileNamespace( prefix )}`,
			srinfo: [ /* no metadata */ ],
			srprop: [ /* no properties (we only need title, which is always returned) */ ],
			formatversion: 2,
		} );
	};
	FileInputWidget.prototype.getLookupCacheDataFromResponse = function ( response ) {
		return response.query.search.map( result => result.title );
	};
	FileInputWidget.prototype.getLookupMenuOptionsFromData = function ( titles ) {
		return titles
			.filter( title => !this.skippedFiles.includes( title ) )
			.map( title => {
				return new OO.ui.MenuOptionWidget( {
					data: title,
					label: title,
				} );
			} );
	};

	/**
	 * FilesWidget is an input widget for a collection of files on the local wiki.
	 * A FileInputWidget is used for the input,
	 * and the input is split on pipe characters
	 * to allow adding multiple files at once.
	 * The File: namespace is automatically added where missing.
	 * The TagMultiselectWidget’s icon is turned into an icon,
	 * which opens a menu with a button to load files from a PagePile.
	 *
	 * @class
	 * @extends OO.ui.TagMultiselectWidget
	 *
	 * @constructor
	 * @param {Object} [config] Configuration options
	 */
	function FilesWidget( config ) {
		FilesWidget.super.call( this, $.extend( {
			allowArbitrary: true,
			inputWidget: new FileInputWidget( $.extend( {
				placeholder: $.i18n( 'gadget-acdc-files-placeholder' ),
			}, config ) ),
			icon: 'ellipsis',
		}, config ) );
		this.input.connect( this, { select: 'addTagFromInput' } );
		this.on( 'change', () => {
			this.input.setSkippedFiles( this.getTitles() );
		} );

		this.$overlay = ( config.$overlay === true ? OO.ui.getDefaultOverlay() : config.$overlay ) || this.$element;
		this.$element.addClass( 'acdc-filesWidget' );

		// we turn the ellipsis icon into a “button” opening a popup menu with currently one button
		this.categoryButton = new OO.ui.ButtonWidget( {
			icon: 'tag',
			label: $.i18n( 'gadget-acdc-load-category' ),
		} );
		this.pagePileButton = new OO.ui.ButtonWidget( {
			icon: 'listBullet',
			label: $.i18n( 'gadget-acdc-load-pagepile' ),
		} );
		this.menuPopup = new OO.ui.PopupWidget( {
			$content: new OO.ui.StackLayout( {
				items: [
					new OO.ui.PanelLayout( {
						$content: this.categoryButton.$element,
						expanded: false,
					} ),
					new OO.ui.PanelLayout( {
						$content: this.pagePileButton.$element,
						expanded: false,
					} ),
				],
				continuous: true,
				expanded: false,
			} ).$element,
			$floatableContainer: this.$icon,
			align: 'forwards',
			autoClose: true,
			$autoCloseIgnore: this.$icon, // click on $icon closes via toggle() below instead
			$overlay: this.$overlay,
			width: null, // use automatic width
			padded: true,
		} );
		this.$overlay.append( this.menuPopup.$element );
		this.$icon.css( { cursor: 'pointer' } );
		this.$icon.on( 'click', () => this.menuPopup.toggle() );
		// TODO this is not very accessible :/
		// but we don’t have many options – we can’t add other elements around the $icon,
		// or the TagMultiselectWidget’s layout breaks

		this.suggestedCurrentCategory = false;
		this.categoryButton.on( 'click', async () => {
			this.menuPopup.toggle( false );

			let defaultCategory = mw.config.get( 'wgPageName' )
				.replace( /_/g, ' ' );
			if ( defaultCategory.startsWith( 'Category:' ) && !this.suggestedCurrentCategory ) {
				this.suggestedCurrentCategory = true;
			} else {
				defaultCategory = null;
			}

			let categoryTitle = await OO.ui.prompt( $.i18n( 'gadget-acdc-load-category-title' ), {
				size: 'medium',
				textInput: {
					placeholder: $.i18n( 'gadget-acdc-load-category-placeholder' ),
					value: defaultCategory,
				},
			} );
			if ( !categoryTitle ) {
				// user clicked “cancel”, nothing to do
				return;
			}

			if ( !categoryTitle.startsWith( 'Category:' ) ) {
				categoryTitle = `Category:${categoryTitle}`;
			}

			try {
				await this.loadCategory( categoryTitle );
			} catch ( e ) {
				await OO.ui.alert( `Error: ${e}` );
			}
		} );

		this.pagePileButton.on( 'click', async () => {
			this.menuPopup.toggle( false );
			const pagePileId = await OO.ui.prompt( $.i18n( 'gadget-acdc-load-pagepile-id' ), {
				textInput: {
					placeholder: '12345',
					type: 'number',
				},
			} );
			if ( !pagePileId ) {
				// user clicked “cancel”, nothing to do
				return;
			}

			await this.loadPagePile( pagePileId );
		} );
	}
	OO.inheritClass( FilesWidget, OO.ui.TagMultiselectWidget );
	FilesWidget.prototype.addTagFromInput = function () {
		const titles = this.input.getValue().split( '|' )
			.map( s => s.trim() )
			.filter( s => s )
			.map( title => ensureFileNamespace( title ) );
		this.clearInput();

		for ( const title of titles ) {
			if ( this.isAllowedData( title ) || this.allowDisplayInvalidTags ) {
				this.addTag( title );
			} else {
				let inputValue = this.input.getValue();
				if ( inputValue ) {
					inputValue += ' | ';
				}
				inputValue += title;
				this.input.setValue( inputValue );
			}
		}
	};
	FilesWidget.prototype.loadCategory = async function ( categoryTitle ) {
		for await ( const file of categoryFiles( categoryTitle ) ) {
			this.addTag( file );
			await microsleep();
		}
	};
	FilesWidget.prototype.loadPagePile = async function ( pagePileId ) {
		const pileJson = await fetch(
			`https://tools.wmflabs.org/pagepile/api.php?action=get_data&id=${pagePileId}&format=json`,
		).then( r => r.json() );
		if ( pileJson.wiki !== mw.config.get( 'wgDBname' ) ) {
			await OO.ui.alert( $.i18n( 'gadget-acdc-load-pagepile-error-wrong-wiki' ) );
			return false;
		}

		const files = pileJson.pages
			.filter( page => page.startsWith( 'File:' ) );
		if ( files.length >= 100 ) {
			const confirmation = await OO.ui.confirm(
				$.i18n( 'gadget-acdc-load-pagepile-warning-large-pagepile', files.length ),
			);
			if ( !confirmation ) {
				return false;
			}
		}

		for ( const file of files ) {
			this.addTag( file );
			await microsleep();
		}

		return true;
	};
	FilesWidget.prototype.getTitles = function () {
		return this.getItems().map( item => item.getData() );
	};

	/**
	 * StatementsProgressBarWidget is a progress bar widget for AC/DC.
	 * It is initialized with the number of files
	 * and number of statements to edit on each file,
	 * and updated whenever progress has been made,
	 * and then calculates the progress itself each time.
	 *
	 * @class
	 * @extends OO.ui.ProgressBarWidget
	 *
	 * @constructor
	 * @param {Object} [config] Configuration options
	 */
	function StatementsProgressBarWidget( config ) {
		StatementsProgressBarWidget.super.call( this, $.extend( {
			progress: 0,
		}, config ) );
		this.toggle( false );
		this.$element.addClass( 'acdc-statementsProgressBarWidget' );
	}
	OO.inheritClass( StatementsProgressBarWidget, OO.ui.ProgressBarWidget );
	StatementsProgressBarWidget.prototype.enable = function ( numberEntities, numberStatementsPerEntity ) {
		this.numberEntities = numberEntities;
		this.numberStatementsPerEntity = numberStatementsPerEntity;
		this.totalQueryCalls = Math.ceil( numberEntities / 50 );
		this.totalGetEntitiesCalls = Math.ceil( numberEntities / 50 );
		this.totalApiCalls = this.totalQueryCalls + this.totalGetEntitiesCalls + this.numberEntities * this.numberStatementsPerEntity;
		this.loadedEntityIds = false;
		this.loadedEntityData = false;
		this.indexEntity = 0;
		this.indexStatement = 0;
		this.toggle( true );
	};
	StatementsProgressBarWidget.prototype.disable = function () {
		this.toggle( false );
		this.setProgress( 0 );
	};
	StatementsProgressBarWidget.prototype.updateProgress = function () {
		this.setProgress(
			100 * ( ( this.loadedEntityIds ? this.totalQueryCalls : 0 ) +
					( this.loadedEntityData ? this.totalGetEntitiesCalls : 0 ) +
					this.indexEntity * this.numberStatementsPerEntity +
					this.indexStatement ) /
				this.totalApiCalls,
		);
	};
	StatementsProgressBarWidget.prototype.finishedLoadingEntityIds = function () {
		this.loadedEntityIds = true;
		this.updateProgress();
	};
	StatementsProgressBarWidget.prototype.finishedLoadingEntityData = function () {
		this.loadedEntityData = true;
		this.updateProgress();
	};
	StatementsProgressBarWidget.prototype.finishedStatements = function ( numberStatements ) {
		this.indexStatement += numberStatements;
		this.updateProgress();
	};
	StatementsProgressBarWidget.prototype.finishedEntity = function () {
		this.indexEntity++;
		this.indexStatement = 0;
		this.updateProgress();
	};
	StatementsProgressBarWidget.prototype.finished = function () {
		this.setProgress( 100 );
	};

	/**
	 * StatementsDialog is the main dialog of AC/DC.
	 * It initializes and arranges the other UI elements,
	 * and performs the edits on publish.
	 *
	 * Adding multiple statements for the same property with the same value is disallowed –
	 * attempting to do so marks the erroneous statements and disables the publish button.
	 * This is because otherwise, AC/DC updates existing statements with the same value
	 * (i. e. to add qualifiers),
	 * so trying to add more than one such statement does not make sense.
	 *
	 * Likewise, an error is reported if two statements in the “remove” section have the same value,
	 * or if any of them have qualifiers, because the meaning of either would be unclear.
	 *
	 * @class
	 * @extends OO.ui.ProcessDialog
	 *
	 * @constructor
	 * @param {Object} [config] Configuration options
	 * @cfg {string[]} [tags] Change tags to apply to edits.
	 */
	function StatementsDialog( config ) {
		StatementsDialog.super.call( this, $.extend( {
			size: 'large',
		}, config ) );
		this.tags = ( config || {} ).tags || [];
		this.$element.addClass( 'acdc-statementsDialog' );
	}
	OO.inheritClass( StatementsDialog, OO.ui.ProcessDialog );
	StatementsDialog.static.name = 'statements';
	StatementsDialog.static.title = 'Add to Commons / Descriptive Claims';
	StatementsDialog.static.actions = [
		{
			action: 'save',
			label: mw.message( 'wikibasemediainfo-filepage-publish' ).text(),
			flags: [ 'primary', 'progressive' ],
			modes: [ 'edit' ],
			disabled: true, // see updateCanSave
		},
		{
			label: mw.message( 'wikibasemediainfo-filepage-cancel' ).text(),
			flags: [ 'safe', 'close' ],
			modes: [ 'edit', 'save' ],
		},
		{
			action: 'stop',
			label: $.i18n( 'gadget-acdc-button-stop-edit' ),
			flags: [ 'primary', 'destructive' ],
			modes: [ 'save' ],
		},
	];
	StatementsDialog.prototype.initialize = function () {
		StatementsDialog.super.prototype.initialize.call( this );
		installStyles();

		this.stopped = false;

		this.filesWidget = new FilesWidget( {
			indicator: 'required',
			$overlay: this.$overlay,
		} );
		this.filesWidget.connect( this, { change: 'updateCanSave' } );
		this.filesWidget.connect( this, { change: 'updateSize' } );

		this.hasDuplicateStatementsToAddPerProperty = {};
		this.statementToAddWidgets = [];
		this.addPropertyToAddWidget = new AddPropertyWidget( {
			$overlay: this.$overlay,
		} );
		this.addPropertyToAddWidget.on( 'choose', ( _widget, { id, datatype } ) => this.addStatementToAddWidget( id, datatype ) );
		this.addPropertyToAddWidget.connect( this, { choose: 'updateSize' } );
		// TODO we should also updateSize when the AddPropertyWidget enters/leaves editing mode, but it doesn’t emit an event for that yet

		this.hasDuplicateStatementsToRemovePerProperty = {};
		this.hasStatementWithQualifiersToRemovePerProperty = {};
		this.statementToRemoveWidgets = [];
		this.addPropertyToRemoveWidget = new AddPropertyWidget( {
			$overlay: this.$overlay,
		} );
		this.addPropertyToRemoveWidget.on( 'choose', ( _widget, { id, datatype } ) => this.addStatementToRemoveWidget( id, datatype ) );
		this.addPropertyToRemoveWidget.connect( this, { choose: 'updateSize' } );
		// TODO we should also updateSize when the AddPropertyWidget enters/leaves editing mode, but it doesn’t emit an event for that yet

		const filesField = new OO.ui.FieldLayout( this.filesWidget, {
			label: $.i18n( 'gadget-acdc-field-files' ),
			align: 'top',
			classes: [ 'acdc-statementsDialog-filesField' ],
		} );
		filesField.$header.wrap( '<h3>' );
		const statementsToAddField = new OO.ui.FieldLayout( this.addPropertyToAddWidget, {
			label: $.i18n( 'gadget-acdc-field-statements-to-add' ),
			align: 'top',
			classes: [ 'acdc-statementsDialog-statementsToAddField' ],
		} );
		statementsToAddField.$header.wrap( '<h3>' );
		const statementsToRemoveField = new OO.ui.FieldLayout( this.addPropertyToRemoveWidget, {
			label: $.i18n( 'gadget-acdc-field-statements-to-remove' ),
			align: 'top',
			classes: [ 'acdc-statementsDialog-statementsToRemoveField' ],
		} );
		statementsToRemoveField.$header.wrap( '<h3>' );

		this.content = new OO.ui.PanelLayout( {
			content: [ new OO.ui.FieldsetLayout( {
				items: window.acdcEnableRemoveFeature ? [ // TODO remove this magic global
					filesField,
					statementsToAddField,
					statementsToRemoveField,
				] : [
					filesField,
					statementsToAddField,
				],
			} ) ],
			padded: true,
			expanded: false,
		} );
		this.$body.append( this.content.$element );

		this.statementsProgressBarWidget = new StatementsProgressBarWidget( {} );
		this.$head.append( this.statementsProgressBarWidget.$element );

		this.duplicateStatementsToAddError = new OO.ui.MessageWidget( {
			type: 'error',
			label: $.i18n( 'gadget-acdc-error-duplicate-statements-to-add' ),
		} );
		this.duplicateStatementsToAddError.toggle( false ); // see updateShowDuplicateStatementsToAddError
		this.$foot.append( this.duplicateStatementsToAddError.$element );

		this.duplicateStatementsToRemoveError = new OO.ui.MessageWidget( {
			type: 'error',
			label: $.i18n( 'gadget-acdc-error-duplicate-statements-to-remove' ),
		} );
		this.duplicateStatementsToRemoveError.toggle( false ); // see updateShowDuplicateStatementsToRemoveError
		this.$foot.append( this.duplicateStatementsToRemoveError.$element );

		this.statementWithQualifiersToRemoveError = new OO.ui.MessageWidget( {
			type: 'error',
			label: $.i18n( 'gadget-acdc-error-statement-with-qualifiers-to-remove' ),
		} );
		this.statementWithQualifiersToRemoveError.toggle( false ); // see updateShowStatementWithQualifiersToRemoveError
		this.$foot.append( this.statementWithQualifiersToRemoveError.$element );

		const favoritePropertiesToAdd = window.acdcFavoritePropertiesToAdd ||
			window.acdcFavoriteProperties ||
			mw.config.get( 'wbmiDefaultProperties', [] );
		const favoritePropertiesToRemove = window.acdcFavoritePropertiesToRemove ||
			window.acdcFavoriteProperties ||
			[];
		propertyDatatypes( Array.from( new Set( [ ...favoritePropertiesToAdd, ...favoritePropertiesToRemove ] ) ) ).then( datatypes => {
			for ( const favoritePropertyToAdd of favoritePropertiesToAdd ) {
				this.addStatementToAddWidget( favoritePropertyToAdd, datatypes[ favoritePropertyToAdd ] );
			}
			for ( const favoritePropertyToRemove of favoritePropertiesToRemove ) {
				this.addStatementToRemoveWidget( favoritePropertyToRemove, datatypes[ favoritePropertyToRemove ] );
			}
		} );
	};
	StatementsDialog.prototype.getSetupProcess = function ( data ) {
		return StatementsDialog.super.prototype.getSetupProcess.call( this, data ).next( async () => {
			this.title.setLabel( 'AC/DC' );
			this.actions.setMode( 'edit' );
			if ( 'tags' in data ) {
				this.tags = data.tags;
			}
		} );
	};
	StatementsDialog.prototype.getReadyProcess = function ( data ) {
		return StatementsDialog.super.prototype.getReadyProcess.call( this, data ).next( async () => {
			this.filesWidget.updateInputSize();
			this.filesWidget.focus();
		} );
	};
	StatementsDialog.prototype.getActionProcess = function ( action ) {
		switch ( action ) {
			case 'save':
				return new OO.ui.Process( async () => {
					this.actions.setMode( 'save' );

					const finished = await this.save().catch( error => {
						console.error( 'AC/DC: error while saving', error );
						throw new OO.ui.Error( error, { recoverable: false } );
					} );

					if ( finished ) {
						this.actions.setMode( 'edit' );
						this.close();
					}
				} ).next( async () => {
					// regardless whether we finished or stopped, remove the progress bar again
					this.statementsProgressBarWidget.disable();
				} );
			case 'stop':
				return new OO.ui.Process( async () => {
					this.stopped = true;
					this.actions.setMode( 'edit' );
				} );
			default:
				return StatementsDialog.super.prototype.getActionProcess.call( this, action );
		}
	};
	StatementsDialog.prototype.addStatementToAddWidget = function ( id, datatype ) {
		const statementToAddWidget = new StatementWidget( {
			entityId: '', // this widget is reused for multiple entities, we inject the entity IDs on publish
			propertyId: id,
			isDefaultProperty: false,
			propertyType: datatype,
			$overlay: this.$overlay,
			tags: this.tags,
		} );
		statementToAddWidget.connect( this, { change: 'updateCanSave' } );
		statementToAddWidget.connect( this, { change: 'updateSize' } );
		statementToAddWidget.on( 'change', () => {
			// check if there are any duplicate statements for this property
			this.hasDuplicateStatementsToAddPerProperty[ id ] = false;
			const itemWidgets = statementToAddWidget.getItems();

			for ( const itemWidget of itemWidgets ) {
				itemWidget.$element.removeClass( 'acdc-statementsDialog__statementWidget--duplicate-statement' );
			}

			// this is O(n²) but for small n
			for ( let i = 0; i < itemWidgets.length; i++ ) {
				const itemWidget1 = itemWidgets[ i ];
				for ( let j = i + 1; j < itemWidgets.length; j++ ) {
					const itemWidget2 = itemWidgets[ j ];
					if ( itemWidget1.getData().getClaim().getMainSnak().equals( itemWidget2.getData().getClaim().getMainSnak() ) ) {
						this.hasDuplicateStatementsToAddPerProperty[ id ] = true;
						itemWidget1.$element.addClass( 'acdc-statementsDialog__statementWidget--duplicate-statement' );
						itemWidget2.$element.addClass( 'acdc-statementsDialog__statementWidget--duplicate-statement' );
					}
				}
			}

			this.updateShowDuplicateStatementsToAddError();
			this.updateCanSave();
		} );
		this.statementToAddWidgets.push( statementToAddWidget );

		statementToAddWidget.$element.insertBefore( this.addPropertyToAddWidget.$element );
	};
	StatementsDialog.prototype.addStatementToRemoveWidget = function ( id, datatype ) {
		const statementToRemoveWidget = new StatementWidget( {
			entityId: '', // this widget is reused for multiple entities, we inject the entity IDs on publish
			propertyId: id,
			isDefaultProperty: false,
			propertyType: datatype,
			$overlay: this.$overlay,
			tags: this.tags,
		} );
		statementToRemoveWidget.connect( this, { change: 'updateCanSave' } );
		statementToRemoveWidget.connect( this, { change: 'updateSize' } );
		statementToRemoveWidget.on( 'change', () => {
			// check if there are any duplicate statements or statements with qualifiers for this property
			this.hasDuplicateStatementsToRemovePerProperty[ id ] = false;
			this.hasStatementWithQualifiersToRemovePerProperty[ id ] = false;
			const itemWidgets = statementToRemoveWidget.getItems();

			for ( const itemWidget of itemWidgets ) {
				itemWidget.$element.removeClass( 'acdc-statementsDialog__statementWidget--duplicate-statement' );
				itemWidget.$element.removeClass( 'acdc-statementsDialog__statementWidget--statement-with-qualifiers-to-remove' );
			}

			// this is O(n²) but for small n
			for ( let i = 0; i < itemWidgets.length; i++ ) {
				const itemWidget1 = itemWidgets[ i ];
				for ( let j = i + 1; j < itemWidgets.length; j++ ) {
					const itemWidget2 = itemWidgets[ j ];
					if ( itemWidget1.getData().getClaim().getMainSnak().equals( itemWidget2.getData().getClaim().getMainSnak() ) ) {
						this.hasDuplicateStatementsToRemovePerProperty[ id ] = true;
						itemWidget1.$element.addClass( 'acdc-statementsDialog__statementWidget--duplicate-statement' );
						itemWidget2.$element.addClass( 'acdc-statementsDialog__statementWidget--duplicate-statement' );
					}
				}
			}

			for ( const itemWidget of itemWidgets ) {
				// TODO we don’t check for references here (but WikibaseMediaInfo doesn’t support them yet as of writing this)
				if ( !itemWidget.getData().getClaim().getQualifiers().isEmpty() ) {
					this.hasStatementWithQualifiersToRemovePerProperty[ id ] = true;
					itemWidget.$element.addClass( 'acdc-statementsDialog__statementWidget--statement-with-qualifiers-to-remove' );
				}
			}

			this.updateShowDuplicateStatementsToRemoveError();
			this.updateShowStatementWithQualifiersToRemoveError();
			this.updateCanSave();
		} );
		this.statementToRemoveWidgets.push( statementToRemoveWidget );

		statementToRemoveWidget.$element.insertBefore( this.addPropertyToRemoveWidget.$element );
	};
	StatementsDialog.prototype.onActionClick = function ( action ) {
		if ( !this.isPending() || action.getAction() === 'stop' ) {
			// usually, actions are not executed while pending;
			// however, we want the 'stop' action to go through during save –
			// it would be nice if there was a better way to do this :/
			this.executeAction( action.getAction() );
		}
	};
	/**
	 * Saves changes to the statements.
	 *
	 * @return {Promise<boolean>} Whether the save finished completely (true) or was stopped prematurely (false).
	 */
	StatementsDialog.prototype.save = async function () {
		const titles = this.filesWidget.getTitles();
		this.statementsProgressBarWidget.enable(
			titles.length,
			this.statementToAddWidgets.reduce( ( acc, statementToAddWidget ) => acc + statementToAddWidget.getData().length, 0 ) +
				this.statementToRemoveWidgets.reduce( ( acc, statementToRemoveWidget ) => acc + statementToRemoveWidget.getData().length, 0 ),
		);

		await Promise.all( this.statementToAddWidgets.map(
			statementToAddWidget => statementToAddWidget.setDisabled( true ).setEditing( false ) ) );
		await Promise.all( this.statementToRemoveWidgets.map(
			statementToRemoveWidget => statementToRemoveWidget.setDisabled( true ).setEditing( false ) ) );

		const entityIds = await titlesToEntityIds( titles );
		this.statementsProgressBarWidget.finishedLoadingEntityIds();

		const entityData = await entityIdsToData( Object.values( entityIds ), [ 'info', 'claims' ] );
		this.statementsProgressBarWidget.finishedLoadingEntityData();

		const api = new mw.Api(),
			statementListDeserializer = new StatementListDeserializer(),
			statementSerializer = new StatementSerializer(),
			statementDeserializer = new StatementDeserializer();
		for ( const [ title, entityId ] of Object.entries( entityIds ) ) {
			const guidGenerator = new ClaimGuidGenerator( entityId );

			for ( const statementToAddWidget of this.statementToAddWidgets ) {
				const previousStatements = statementListDeserializer.deserialize(
					entityData[ entityId ].statements[ statementToAddWidget.state.propertyId ] || [] );
				const changedStatements = statementToAddWidget.getData().toArray()
					.flatMap( newStatement => {
						for ( const previousStatement of previousStatements.toArray() ) {
							if ( newStatement.getClaim().getMainSnak().equals( previousStatement.getClaim().getMainSnak() ) ) {
								// main value matches
								if ( newStatement.equals( previousStatement ) ) {
									// full match, do nothing
									return [];
								} else {
									// potentially add qualifiers and bump rank (on a copy of the existing statement)
									// TODO we don’t support references here yet (but neither does WikibaseMediaInfo as of writing this)
									const updatedStatement = statementDeserializer.deserialize(
										statementSerializer.serialize( previousStatement ) );

									updatedStatement.getClaim().getQualifiers().merge( newStatement.getClaim().getQualifiers() );

									if ( newStatement.getRank() !== Statement.RANK.NORMAL &&
										updatedStatement.getRank() === Statement.RANK.NORMAL ) {
										updatedStatement.setRank( newStatement.getRank() );
									}

									if ( updatedStatement.equals( previousStatement ) ) {
										// not equal but no change from our side, do nothing
										return [];
									} else {
										// adding some qualifiers or bumping rank
										return [ updatedStatement ];
									}
								}
							}
						}
						// no existing statement matched, add new
						return [ new Statement(
							new Claim( newStatement.getClaim().getMainSnak(), newStatement.getClaim().getQualifiers(), guidGenerator.newGuid() ),
							newStatement.getReferences(),
							newStatement.getRank(),
						) ];
					} );

				for ( const changedStatement of changedStatements ) {
					if ( this.stopped ) {
						this.stopped = false;
						return false;
					}

					await api.postWithEditToken( api.assertCurrentUser( {
						action: 'wbsetclaim',
						claim: JSON.stringify( statementSerializer.serialize( changedStatement ) ),
						baserevid: entityData[ entityId ].lastrevid,
						bot: 1,
						tags: this.tags,
						format: 'json',
						formatversion: '2',
						errorformat: 'plaintext',
					} ) ).catch( ( ...args ) => { throw args; } ); // jQuery can reject with multiple errors, native promises can’t
					// TODO handle API errors better
				}

				this.statementsProgressBarWidget.finishedStatements(
					statementToAddWidget.getData().length, // for the progress, we also count statements that didn’t change
				);
			}

			for ( const statementToRemoveWidget of this.statementToRemoveWidgets ) {
				const previousStatements = statementListDeserializer.deserialize(
					entityData[ entityId ].statements[ statementToRemoveWidget.state.propertyId ] || [] );
				const statementIdsToRemove = statementToRemoveWidget.getData().toArray()
					.flatMap( statementToRemove => {
						const matchingStatementIds = previousStatements.toArray().flatMap( statement => {
							if ( statement.getClaim().getMainSnak().equals( statementToRemove.getClaim().getMainSnak() ) ) {
								return [ statement.getClaim().getGuid() ];
							} else {
								return [];
							}
						} );
						if ( matchingStatementIds.length > 1 ) {
							console.warn( `Deleting more than one matching statement on ${entityId}`, matchingStatementIds );
						}
						return matchingStatementIds;
					} );

				for ( const statementIdToRemove of statementIdsToRemove ) {
					if ( this.stopped ) {
						this.stopped = false;
						return false;
					}

					// wbremoveclaims supports removing multiple statements at once, but we edit one at a time to get better edit summaries
					await api.postWithEditToken( api.assertCurrentUser( {
						action: 'wbremoveclaims',
						claim: [ statementIdToRemove ],
						baserevid: entityData[ entityId ].lastrevid,
						bot: 1,
						tags: this.tags,
						format: 'json',
						formatversion: '2',
						errorformat: 'plaintext',
					} ) ).catch( ( ...args ) => { throw args; } ); // jQuery can reject with multiple errors, native promises can’t
					// TODO handle API errors better
				}

				this.statementsProgressBarWidget.finishedStatements(
					statementToRemoveWidget.getData().length, // for the progress, we also count statements that didn’t change
				);
			}

			this.filesWidget.removeTagByData( title );
			this.statementsProgressBarWidget.finishedEntity();
		}

		this.statementsProgressBarWidget.finished();
		// leave the dialog open for a second so the user has a chance to see the finished progress bar
		await new Promise( resolve => setTimeout( resolve, 1000 ) );

		return true;
	};
	StatementsDialog.prototype.hasDuplicateStatementsToAdd = function () {
		return Object.values( this.hasDuplicateStatementsToAddPerProperty ).some( b => b );
	};
	StatementsDialog.prototype.hasDuplicateStatementsToRemove = function () {
		return Object.values( this.hasDuplicateStatementsToRemovePerProperty ).some( b => b );
	};
	StatementsDialog.prototype.hasStatementWithQualifiersToRemove = function () {
		return Object.values( this.hasStatementWithQualifiersToRemovePerProperty ).some( b => b );
	};
	StatementsDialog.prototype.updateCanSave = function () {
		this.actions.setAbilities( {
			save: this.filesWidget.getTitles().length &&
				(
					this.statementToAddWidgets.some(
						statementToAddWidget => statementToAddWidget.getData().length ) ||
					this.statementToRemoveWidgets.some(
						statementToRemoveWidget => statementToRemoveWidget.getData().length )
				) &&
				!this.hasDuplicateStatementsToAdd() &&
				!this.hasDuplicateStatementsToRemove() &&
				!this.hasStatementWithQualifiersToRemove(),
		} );
	};
	StatementsDialog.prototype.updateShowDuplicateStatementsToAddError = function () {
		this.duplicateStatementsToAddError.toggle( this.hasDuplicateStatementsToAdd() );
	};
	StatementsDialog.prototype.updateShowDuplicateStatementsToRemoveError = function () {
		this.duplicateStatementsToRemoveError.toggle( this.hasDuplicateStatementsToRemove() );
	};
	StatementsDialog.prototype.updateShowStatementWithQualifiersToRemoveError = function () {
		this.statementWithQualifiersToRemoveError.toggle( this.hasStatementWithQualifiersToRemove() );
	};
	StatementsDialog.prototype.getBodyHeight = function () {
		// we ceil the body height to the next multiple of 200 so it doesn’t change too often
		return this.$head.outerHeight( true ) +
			Math.max(
				400, // minimum size to start out with
				Math.ceil( this.$body.outerHeight( true ) / 200 ) * 200,
			) +
			this.$foot.outerHeight( true ) +
			50; // not sure why a bit of extra space is necessary :/
	};

	let tags = [];
	if ( mw.config.get( 'wgServer' ) === '//commons.wikimedia.org' ||
		mw.config.get( 'wgServer' ) === '//test-commons.wikimedia.org' ) {
		tags = [ 'ACDC' ];
	}

	const factory = new OO.Factory();
	factory.register( StatementsDialog );

	const windowManager = new OO.ui.WindowManager( { factory } );
	$( document.body ).append( windowManager.$element );

	// ensure default window manager for prompt, alert etc. comes after (i.e. displays above) ours,
	// even if it had already been created and attached to the DOM earlier
	OO.ui.getWindowManager().$element.insertAfter( windowManager.$element );

	const portletLink = mw.util.addPortletLink( 'p-tb', '', 'AC/DC', 't-acdc' ),
		$portletLink = $( portletLink );
	$portletLink.on( 'click', () => {
		try {
			windowManager.openWindow( 'statements', { tags } );
		} catch ( e ) {
			OO.ui.alert( String( e ) );
		}
		return false;
	} );

	const startup = mw.util.getParamValue( 'acdcShow' ),
		startupPagePileId = mw.util.getParamValue( 'acdcPagePileId' );
	if ( startup || startupPagePileId ) {
		windowManager.openWindow( 'statements', { tags } );
		const statementsDialog = await windowManager.getWindow( 'statements' );
		if ( startupPagePileId ) {
			await statementsDialog.filesWidget.loadPagePile( startupPagePileId );
		}
	}
}( mediaWiki, jQuery ) );
