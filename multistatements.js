( async function () {
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
        } );
        filesWidget.on( 'add', ( item, index ) => {
            if ( !item.getData().startsWith( 'File:' ) ) {
                item.setData( `File:${ item.getData() }` );
                item.setLabel( item.getData() );
            }
        } );

        const addPropertyWidget = new AddPropertyWidget(),
              statementWidgets = [];
        addPropertyWidget.on( 'choose', ( { id } ) => {
            const statementWidget = new StatementWidget( {
                entityId: '', // this widget is reused for multiple entities, we inject the entity IDs on publish
                propertyId: id,
                isDefaultProperty: false,
                properties: { [ id ]: 'wikibase-entityid' }, // pretend all properties use entity IDs, for now
            } );
            statementWidgets.push( statementWidget );

            statementWidget.getRemovals = () => []; // this widget shall never remove statements

            statementWidget.$element.insertBefore( addPropertyWidget.$element );
        } );

        const publishButton = new OO.ui.ButtonWidget( {
            label: 'Publish statements',
            flags: 'progressive',
        } );
        publishButton.on( 'click', async () => {
            const api = new mw.Api(),
                  titles = filesWidget.getItems().map( item => item.getData() ),
                  entityIds = [];
            let someTitles;
            while ( ( someTitles = titles.splice( 0, 50 ) ).length > 0 ) {
                const response = await api.get( { action: 'query', titles: someTitles, formatversion: 2 } ),
                      someEntityIds = response.query.pages.map( page => `M${ page.pageid }` );
                entityIds.push( ...someEntityIds );
            }
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
