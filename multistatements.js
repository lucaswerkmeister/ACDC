( async function () {
    'use strict';

    async function titlesToEntityIds( titles ) {
        const api = new mw.Api(),
              entityIds = [];
        let someTitles;
        while ( ( someTitles = titles.splice( 0, 50 ) ).length > 0 ) {
            const response = await api.get( { action: 'query', titles: someTitles, formatversion: 2 } ),
                  someEntityIds = response.query.pages.map( page => `M${ page.pageid }` );
            entityIds.push( ...someEntityIds );
        }
        return entityIds;
    }
    
    const require = await mw.loader.using( [ 'oojs', 'oojs-ui-core', 'oojs-ui-widgets', 'oojs-ui-windows', 'wikibase.mediainfo.statements', 'wikibase.datamodel.Claim', 'mediawiki.api' ] ),
          { StatementWidget, AddPropertyWidget } = require( 'wikibase.mediainfo.statements' );

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

        this.filesWidget = new OO.ui.TagMultiselectWidget( {
            allowArbitrary: true,
            placeholder: 'File:Example.png',
            indicator: 'required',
            $overlay: this.$overlay,
        } );
        this.filesWidget.on( 'add', ( item, index ) => {
            if ( !item.getData().startsWith( 'File:' ) ) {
                item.setData( `File:${ item.getData() }` );
                item.setLabel( item.getData() );
            }
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

            statementWidget.getRemovals = () => []; // this widget shall never remove statements

            statementWidget.$element.insertBefore( addPropertyWidget.$element );
        } );
        addPropertyWidget.connect( this, { choose: 'updateSize' } );
        // TODO we should also updateSize when the AddPropertyWidget enters/leaves editing mode, but it doesn’t emit an event for that yet

        this.content = new OO.ui.PanelLayout( {
            padded: true,
            expanded: false,
        } );
        this.content.$element.append(
            this.filesWidget.$element,
            addPropertyWidget.$element,
        );
        this.$body.append( this.content.$element );
    };
    StatementsDialog.prototype.getActionProcess = function ( action ) {
        switch ( action ) {
        case 'save':
            return new OO.ui.Process( async () => {
                const titles = this.filesWidget.getItems().map( item => item.getData() ),
                      entityIds = await titlesToEntityIds( titles );
                for ( const entityId of entityIds ) {
                    const guidGenerator = new wikibase.utilities.ClaimGuidGenerator( entityId );
                    for ( const statementWidget of this.statementWidgets ) {
                        for ( const item of statementWidget.items ) {
                            const statement = item.data,
                                  oldClaim = statement.getClaim(),
                                  newClaim = new wb.datamodel.Claim( oldClaim.getMainSnak(), oldClaim.getQualifiers(), guidGenerator.newGuid() );
                            statement.setClaim( newClaim );
                        }
                        await statementWidget.submit( 0 );
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
            save: this.filesWidget.getItems().length &&
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
          statementDialog = new StatementsDialog( {} );
    $( document.body ).append( windowManager.$element );
    windowManager.addWindows( [ statementDialog ] );
    windowManager.openWindow( statementDialog );
} )();
