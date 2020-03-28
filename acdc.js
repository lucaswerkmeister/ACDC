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
			'gadget-acdc-field-statements': 'Statements to add',
			'gadget-acdc-file-placeholder': 'File:Example.png',
			'gadget-acdc-files-placeholder': 'File:Example.png | File:Example.jpg',
			'gadget-acdc-error-duplicate-statements':
				'You specified multiple statements with the same main value, ' +
				'which is not supported. ' +
				'If you need to make multiple changes to one statement, merge them. ' +
				'If you really need to add multiple statements with the same value, ' +
				'you’ll have to find another way (sorry).',
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

	/**
	 * Maps titles to entity IDs.
	 * @param {string[]} titles
	 * @return {Object.<string,string>} map from title to entity ID
	 */
	async function titlesToEntityIds( titles ) {
		const api = new mw.Api(),
			allTitles = titles.slice(), // copy that we can splice without affecting the original
			entityIds = {};
		let someTitles;
		while ( ( someTitles = allTitles.splice( 0, 50 ) ).length > 0 ) {
			const response = await api.get( { action: 'query', titles: someTitles, formatversion: 2 } );
			for ( const page of response.query.pages ) {
				entityIds[ page.title ] = `M${page.pageid}`;
			}
		}
		return entityIds;
	}

	/**
	 * Maps entity IDs to entity data.
	 * @param {string[]} entityIds
	 * @param {string[]} props
	 * @return {Object.<string,Object>} map from entity ID to entity data
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
	 * Sleep for a tiny bit, to give the browser time to update the UI.
	 * Usually called in busy loops that would otherwise block for a while, freezing the browser.
	 * Calling this may slow down the process a bit, but is much more responsive.
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
	 * and number of statements to add to each file,
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

		this.stopped = false;

		this.filesWidget = new FilesWidget( {
			indicator: 'required',
			$overlay: this.$overlay,
		} );
		this.filesWidget.connect( this, { change: 'updateCanSave' } );
		this.filesWidget.connect( this, { change: 'updateSize' } );

		this.hasDuplicateStatementsPerProperty = {};
		this.statementWidgets = [];
		const addPropertyWidget = new AddPropertyWidget( {
			$overlay: this.$overlay,
		} );
		addPropertyWidget.on( 'choose', ( _widget, { id, datatype } ) => {
			const statementWidget = new StatementWidget( {
				entityId: '', // this widget is reused for multiple entities, we inject the entity IDs on publish
				propertyId: id,
				isDefaultProperty: false,
				propertyType: datatype,
				$overlay: this.$overlay,
				tags: this.tags,
			} );
			statementWidget.connect( this, { change: 'updateCanSave' } );
			statementWidget.connect( this, { change: 'updateSize' } );
			statementWidget.on( 'change', () => {
				// check if there are any duplicate statements for this property
				this.hasDuplicateStatementsPerProperty[ id ] = false;
				const itemWidgets = statementWidget.getItems();

				for ( const itemWidget of itemWidgets ) {
					itemWidget.$element.css( 'border-left', 'none' );
				}

				// this is O(n²) but for small n
				for ( let i = 0; i < itemWidgets.length; i++ ) {
					const itemWidget1 = itemWidgets[ i ];
					for ( let j = i + 1; j < itemWidgets.length; j++ ) {
						const itemWidget2 = itemWidgets[ j ];
						if ( itemWidget1.getData().getClaim().getMainSnak().equals( itemWidget2.getData().getClaim().getMainSnak() ) ) {
							this.hasDuplicateStatementsPerProperty[ id ] = true;
							itemWidget1.$element.css( 'border-left', '2px solid red' ); // TODO better way to indicate errors
							itemWidget2.$element.css( 'border-left', '2px solid red' );
						}
					}
				}

				this.updateShowDuplicateStatementsError();
				this.updateCanSave();
			} );
			this.statementWidgets.push( statementWidget );

			statementWidget.$element.insertBefore( addPropertyWidget.$element );
		} );
		addPropertyWidget.connect( this, { choose: 'updateSize' } );
		// TODO we should also updateSize when the AddPropertyWidget enters/leaves editing mode, but it doesn’t emit an event for that yet

		const filesField = new OO.ui.FieldLayout( this.filesWidget, {
			label: $.i18n( 'gadget-acdc-field-files' ),
			align: 'top',
			classes: [ 'acdc-statementsDialog-filesField' ],
		} );
		filesField.$header.wrap( '<h3>' );
		const statementsField = new OO.ui.FieldLayout( addPropertyWidget, {
			label: $.i18n( 'gadget-acdc-field-statements' ),
			align: 'top',
			classes: [ 'acdc-statementsDialog-statementsField' ],
		} );
		statementsField.$header.wrap( '<h3>' );

		this.content = new OO.ui.PanelLayout( {
			content: [ new OO.ui.FieldsetLayout( {
				items: [
					filesField,
					statementsField,
				],
			} ) ],
			padded: true,
			expanded: false,
		} );
		this.$body.append( this.content.$element );

		this.statementsProgressBarWidget = new StatementsProgressBarWidget( {} );
		this.$head.append( this.statementsProgressBarWidget.$element );

		this.duplicateStatementsError = new OO.ui.MessageWidget( {
			type: 'error',
			label: $.i18n( 'gadget-acdc-error-duplicate-statements' ),
		} );
		this.duplicateStatementsError.toggle( false ); // see updateShowDuplicateStatementsError
		this.$foot.append( this.duplicateStatementsError.$element );
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
	 * @return {boolean} Whether the save finished completely (true) or was stopped prematurely (false).
	 */
	StatementsDialog.prototype.save = async function () {
		const titles = this.filesWidget.getTitles();
		this.statementsProgressBarWidget.enable(
			titles.length,
			this.statementWidgets.reduce( ( acc, statementWidget ) => acc + statementWidget.getData().length, 0 ),
		);

		await Promise.all( this.statementWidgets.map(
			statementWidget => statementWidget.setDisabled( true ).setEditing( false ) ) );

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

			for ( const statementWidget of this.statementWidgets ) {
				const previousStatements = statementListDeserializer.deserialize(
					entityData[ entityId ].statements[ statementWidget.state.propertyId ] || [] );
				const changedStatements = statementWidget.getData().toArray()
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
					statementWidget.getData().length, // for the progress, we also count statements that didn’t change
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
	StatementsDialog.prototype.hasDuplicateStatements = function () {
		return Object.values( this.hasDuplicateStatementsPerProperty ).some( b => b );
	};
	StatementsDialog.prototype.updateCanSave = function () {
		this.actions.setAbilities( {
			save: this.filesWidget.getTitles().length &&
				this.statementWidgets.some(
					statementWidget => statementWidget.getData().length ) &&
				!this.hasDuplicateStatements(),
		} );
	};
	StatementsDialog.prototype.updateShowDuplicateStatementsError = function () {
		this.duplicateStatementsError.toggle( this.hasDuplicateStatements() );
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
