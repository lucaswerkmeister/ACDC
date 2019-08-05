( async function ( mw, $ ) {
    'use strict';

    const require = await mw.loader.using( [
        'oojs',
        'oojs-ui-core',
        'oojs-ui-widgets',
        'oojs-ui-windows',
        'wikibase.mediainfo.statements',
        'wikibase.utilities.ClaimGuidGenerator',
        'wikibase.datamodel.Statement',
        'wikibase.datamodel.Claim',
        'wikibase.datamodel.PropertyNoValueSnak',
        'wikibase.serialization.StatementListDeserializer',
        'mediawiki.api',
    ] ),
          { StatementWidget, AddPropertyWidget } = require( 'wikibase.mediainfo.statements' );

    async function titlesToEntityIds( titles ) {
        const api = new mw.Api(),
              allTitles = titles.slice(), // copy that we can splice without affecting the original
              entityIds = [];
        let someTitles;
        while ( ( someTitles = allTitles.splice( 0, 50 ) ).length > 0 ) {
            const response = await api.get( { action: 'query', titles: someTitles, formatversion: 2 } ),
                  someEntityIds = response.query.pages.map( page => `M${ page.pageid }` );
            entityIds.push( ...someEntityIds );
        }
        return entityIds;
    }

    async function entityIdsToData( entityIds, props ) {
        const api = new mw.Api(),
              allEntityIds = entityIds.slice(), // copy that we can splice without affecting the original
              entityData = {};
        let someEntityIds;
        while ( ( someEntityIds = allEntityIds.splice( 0, 50 ) ).length > 0 ) {
            const response = await api.get( { action: 'wbgetentities', ids: someEntityIds, props, formatversion: 2 } );
            Object.assign( entityData, response.entities );
        }
        return entityData;
    }
    
    function failSanityCheck( component ) {
        throw new Error( `${ component } seems to have changed incompatibly, this script must be updated before it can be safely used!` );
    }

    function sanityCheckStatementWidgetPrototype() {
        if ( !( 'getChanges' in StatementWidget.prototype &&
                'getRemovals' in StatementWidget.prototype ) ) {
            // if StatementWidget doesn’t use these methods, it’ll make wrong edits
            failSanityCheck( 'StatementWidget.prototype' );
        }
    }

    function sanityCheckStatementEquals() {
        const snak = new wikibase.datamodel.PropertyNoValueSnak( 'P1' ),
              claim1 = new wikibase.datamodel.Claim( snak, null, 'guid 1' ),
              statement1 = new wikibase.datamodel.Statement( claim1 ),
              claim2 = new wikibase.datamodel.Claim( snak, null, 'guid 2' ),
              statement2 = new wikibase.datamodel.Statement( claim2 );
        if ( !statement1.equals( statement2 ) ) {
            // if different GUIDs break Statement.equals, we can’t detect duplicate statements
            failSanityCheck( 'Statement.equals' );
        }
    }

    sanityCheckStatementWidgetPrototype();
    sanityCheckStatementEquals();

    function ensureFileNamespace( title ) {
        if ( title.startsWith( 'File:' ) ) {
            return title;
        } else {
            return `File:${ title }`;
        }
    }

    function FileInputWidget( config ) {
        FileInputWidget.super.call( this, $.extend( {
            placeholder: 'File:Example.png',
        }, config ) );
        OO.ui.mixin.LookupElement.call( this, $.extend( {
            showPendingRequest: false,
            $container: this.$input, // the default is this.$element, which in a non-'outline' TagMultiselectWidget is never attached to the DOM, so the lookup can’t position itself relative to it
        }, config ) );
        this.lookupMenu.connect( this, { choose: [ 'emit', 'select' ] } );
        this.$input.on( 'paste', ( { originalEvent: clipboardEvent } ) => {
            const value = clipboardEvent.clipboardData.getData( 'text' )
                  .trim()
                  .replace( /[\n\t]/g, ' | ' ),
                  inputElement = this.$input[ 0 ];

            inputElement.setRangeText( value );
            inputElement.selectionStart += value.length;
            inputElement.selectionEnd = inputElement.selectionStart;

            clipboardEvent.preventDefault();
        } );
    }
    OO.inheritClass( FileInputWidget, OO.ui.TextInputWidget );
    OO.mixinClass( FileInputWidget, OO.ui.mixin.LookupElement );
    FileInputWidget.prototype.getLookupRequest = function () {
        let prefix = this.getValue();
        if ( !prefix || prefix.indexOf( '|' ) !== -1 ) {
            return $.Deferred().resolve( [] ).promise();
        }

        const api = new mw.Api();
        return api.get( {
            action: 'query',
            list: 'search',
            srsearch: `prefix:${ ensureFileNamespace( prefix ) }`,
            srinfo: [ /* no metadata */ ],
            srprop: [ /* no properties (we only need title, which is always returned) */ ],
            formatversion: 2,
        } );
    };
    FileInputWidget.prototype.getLookupCacheDataFromResponse = function ( response ) {
        return response.query.search.map( result => result.title );
    };
    FileInputWidget.prototype.getLookupMenuOptionsFromData = function ( titles ) {
        return titles.map( title => {
            return new OO.ui.MenuOptionWidget( {
                data: title,
                label: title,
            } );
        } );
    };

    function FilesWidget( config ) {
        FilesWidget.super.call( this, $.extend( {
            allowArbitrary: true,
            inputWidget: new FileInputWidget( $.extend( {
                placeholder: 'File:Example.png | File:Example.jpg',
            }, config ) ),
        }, config ) );
        this.input.connect( this, { select: 'addTagFromInput' } );
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
    FilesWidget.prototype.getTitles = function () {
        return this.getItems().map( item => item.getData() );
    };

    function StatementsProgressBarWidget( config ) {
        StatementsProgressBarWidget.super.call( this, $.extend( {
            progress: 0,
        }, config ) );
        this.toggle( false );
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
    StatementsProgressBarWidget.prototype.updateProgress = function () {
        this.setProgress(
            100 * ( ( this.loadedEntityIds ? this.totalQueryCalls : 0 ) +
                    ( this.loadedEntityData ? this.totalGetEntitiesCalls : 0 ) +
                    this.indexEntity * this.numberStatementsPerEntity +
                    this.indexStatement
                  ) / this.totalApiCalls
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

    function StatementsDialog( config ) {
        StatementsDialog.super.call( this, $.extend( {
            size: 'large',
        }, config ) );
    }
    OO.inheritClass( StatementsDialog, OO.ui.ProcessDialog );
    StatementsDialog.static.name = 'statements';
    StatementsDialog.static.title = 'MultiStatements';
    StatementsDialog.static.actions = [
        {
            action: 'save',
            label: mw.message( 'wikibasemediainfo-filepage-publish' ).text(),
            flags: [ 'primary', 'progressive' ],
            disabled: true, // see updateCanSave
        },
        {
            label: mw.message( 'wikibasemediainfo-filepage-cancel' ).text(),
            flags: [ 'safe', 'close' ],
        },
    ];
    StatementsDialog.prototype.initialize = function () {
        StatementsDialog.super.prototype.initialize.call( this );

        this.filesWidget = new FilesWidget( {
            indicator: 'required',
            $overlay: this.$overlay,
        } );
        this.filesWidget.connect( this, { change: 'updateCanSave' } );
        this.filesWidget.connect( this, { change: 'updateSize' } );

        this.statementWidgets = [];
        const addPropertyWidget = new AddPropertyWidget( {
            $overlay: this.$overlay,
        } );
        addPropertyWidget.on( 'choose', ( { id } ) => {
            const statementWidget = new StatementWidget( {
                entityId: '', // this widget is reused for multiple entities, we inject the entity IDs on publish
                propertyId: id,
                isDefaultProperty: false,
                properties: { [ id ]: 'wikibase-entityid' }, // pretend all properties use entity IDs, for now
                $overlay: this.$overlay,
            } );
            statementWidget.connect( this, { change: 'updateCanSave' } );
            statementWidget.connect( this, { change: 'updateSize' } );
            this.statementWidgets.push( statementWidget );

            statementWidget.$element.insertBefore( addPropertyWidget.$element );
        } );
        addPropertyWidget.connect( this, { choose: 'updateSize' } );
        // TODO we should also updateSize when the AddPropertyWidget enters/leaves editing mode, but it doesn’t emit an event for that yet

        const filesField = new OO.ui.FieldLayout( this.filesWidget, {
            label: 'Files to edit', // TODO i18n
            align: 'top',
        } );
        filesField.$header.wrap( '<h3>' );
        const addPropertyField = new OO.ui.FieldLayout( addPropertyWidget, {
            label: 'Statements to add', // TODO i18n
            align: 'top',
        } );
        addPropertyField.$header.wrap( '<h3>' );

        this.content = new OO.ui.PanelLayout( {
            content: [ new OO.ui.FieldsetLayout( {
                items: [
                    filesField,
                    addPropertyField,
                ],
            } ) ],
            padded: true,
            expanded: false,
        } );
        this.$body.append( this.content.$element );

        this.statementsProgressBarWidget = new StatementsProgressBarWidget( {} );
        this.$head.append( this.statementsProgressBarWidget.$element );
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
                const titles = this.filesWidget.getTitles();
                this.statementsProgressBarWidget.enable(
                    titles.length,
                    this.statementWidgets.reduce( ( acc, statementWidget ) => acc + statementWidget.getData().length, 0 ),
                );

                const entityIds = await titlesToEntityIds( titles );
                this.statementsProgressBarWidget.finishedLoadingEntityIds();

                const entityData = await entityIdsToData( entityIds, [ 'info', 'claims' ] );
                this.statementsProgressBarWidget.finishedLoadingEntityData();

                const deserializer = new wikibase.serialization.StatementListDeserializer();
                for ( const entityId of entityIds ) {
                    const guidGenerator = new wikibase.utilities.ClaimGuidGenerator( entityId );

                    for ( const statementWidget of this.statementWidgets ) {
                        const previousStatements = deserializer.deserialize( entityData[ entityId ].statements[ statementWidget.propertyId ] || [] );
                        statementWidget.getChanges = () => statementWidget.getData().toArray()
                            .filter( statement => !previousStatements.hasItem( statement ) )
                            .map( statement => new wikibase.datamodel.Statement(
                                new wikibase.datamodel.Claim( statement.getClaim().getMainSnak(), statement.getClaim().getQualifiers(), guidGenerator.newGuid() ),
                                statement.getReferences(),
                                statement.getRank()
                            ) );
                        statementWidget.getRemovals = () => [];

                        await statementWidget.submit( entityData[ entityId ].lastrevid );

                        this.statementsProgressBarWidget.finishedStatements (
                            statementWidget.getData().length // for the progress, we also count statements that didn’t change
                        );
                    }

                    this.statementsProgressBarWidget.finishedEntity();
                }

                this.statementsProgressBarWidget.finished();
                // leave the dialog open for a second so the user has a chance to see the finished progress bar
                await new Promise( ( resolve, reject ) => setTimeout( resolve, 1000 ) );
                this.close();
            }, this );
        default:
            return StatementsDialog.super.prototype.getActionProcess.call( this, action );
        }
    };
    StatementsDialog.prototype.updateCanSave = function () {
        this.actions.setAbilities( {
            save: this.filesWidget.getTitles().length &&
                this.statementWidgets.some(
                    statementWidget => statementWidget.getData().length ),
        } );
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

    const windowManager = new OO.ui.WindowManager(),
          statementsDialog = new StatementsDialog( {} );
    $( document.body ).append( windowManager.$element );
    windowManager.addWindows( [ statementsDialog ] );
    windowManager.openWindow( statementsDialog );
} )( mediaWiki, jQuery );
