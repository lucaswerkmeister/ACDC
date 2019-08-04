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

    function FilesWidget( config ) {
        FilesWidget.super.call( this, $.extend( {
            allowArbitrary: true,
            placeholder: 'File:Example.png',
        }, config ) );

        this.on( 'add', ( item, index ) => {
            if ( !item.getData().startsWith( 'File:' ) ) {
                item.setData( `File:${ item.getData() }` );
                item.setLabel( item.getData() );
            }
        } );
    }
    OO.inheritClass( FilesWidget, OO.ui.TagMultiselectWidget );
    FilesWidget.prototype.getTitles = function () {
        return this.getItems().map( item => item.getData() );
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
                const titles = this.filesWidget.getTitles(),
                      entityIds = await titlesToEntityIds( titles ),
                      entityData = await entityIdsToData( entityIds, [ 'info', 'claims' ] ),
                      deserializer = new wikibase.serialization.StatementListDeserializer();
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
                    }
                }
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
