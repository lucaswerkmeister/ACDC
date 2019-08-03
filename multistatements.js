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
    OO.inheritClass( StatementsDialog, OO.ui.Dialog );
    StatementsDialog.static.name = 'statements';
    StatementsDialog.static.title = 'Statements';
    StatementsDialog.prototype.initialize = function () {
        StatementsDialog.super.prototype.initialize.call( this );

        const filesWidget = new OO.ui.TagMultiselectWidget( {
            allowArbitrary: true,
            placeholder: 'File:Example.png',
            indicator: 'required',
            $overlay: this.$overlay,
        } );
        filesWidget.on( 'add', ( item, index ) => {
            if ( !item.getData().startsWith( 'File:' ) ) {
                item.setData( `File:${ item.getData() }` );
                item.setLabel( item.getData() );
            }
        } );

        const statementWidgets = [],
              addPropertyWidget = new AddPropertyWidget( {
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
            statementWidgets.push( statementWidget );

            statementWidget.getRemovals = () => []; // this widget shall never remove statements

            statementWidget.$element.insertBefore( addPropertyWidget.$element );
        } );

        const publishButton = new OO.ui.ButtonWidget( {
            label: mw.message( 'wikibasemediainfo-filepage-publish' ).text(),
            flags: [ 'primary', 'progressive' ],
            $overlay: this.$overlay,
        } );
        publishButton.on( 'click', async () => {
            const titles = filesWidget.getItems().map( item => item.getData() ),
                  entityIds = await titlesToEntityIds( titles );
            for ( const entityId of entityIds ) {
                const guidGenerator = new wikibase.utilities.ClaimGuidGenerator( entityId );
                for ( const statementWidget of statementWidgets ) {
                    for ( const item of statementWidget.items ) {
                        const statement = item.data,
                              oldClaim = statement.getClaim(),
                              newClaim = new wb.datamodel.Claim( oldClaim.getMainSnak(), oldClaim.getQualifiers(), guidGenerator.newGuid() );
                        statement.setClaim( newClaim );
                    }
                    await statementWidget.submit( 0 );
                }
            }
            this.emit( 'submitted' );
        } );

        this.content = new OO.ui.PanelLayout( { padded: true } );
        this.content.$element.append(
            filesWidget.$element,
            addPropertyWidget.$element,
            publishButton.$element,
        );
        this.$body.append( this.content.$element );
    };
    StatementsDialog.prototype.getBodyHeight = function () {
        return 1000; // TODO figure this out
    }

    const windowManager = new OO.ui.WindowManager(),
          statementDialog = new StatementsDialog( {} );
    $( document.body ).append( windowManager.$element );
    windowManager.addWindows( [ statementDialog ] );
    windowManager.openWindow( statementDialog );
    statementDialog.on( 'submitted', () => windowManager.closeWindow( statementDialog ) );
} )();
