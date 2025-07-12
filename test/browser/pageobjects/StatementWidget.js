const WikibaseMediaInfo = require( './WikibaseMediaInfo' );
const { searchTimeout } = require( '../timeouts' );

class StatementWidget {

	constructor( element ) {
		this.element = element;
	}

	get propertyId() {
		return this.element
			.then( element => element.$( '.wbmi-statement-header a' ) )
			.then( a => a.getAttribute( 'href' ) )
			.then( href => {
				const index = href.lastIndexOf( '/' );
				if ( index === -1 ) {
					throw new Error( `Property ID link unexpectedly contains no /: ${ href }` );
				}
				const propertyId = href.slice( index + 1 );
				if ( !/^P[1-9][0-9]*$/.test( propertyId ) ) {
					throw new Error( `Property ID does not match expected pattern: ${ propertyId } (href: ${ href })` );
				}
				return propertyId;
			} );
	}

	get valueInput() {
		return this.element
			.then( element => element.$( '.wbmi-statement-input input' ) );
	}

	get numberOfValues() {
		return this.element
			.then( element => element.$$( '.wbmi-content-items-group > *' ) )
			.then( values => values.length );
	}

	async waitForDisplayed( options = {} ) {
		await ( await this.element ).waitForDisplayed( options );
	}

	async addValue( itemId ) {
		const numberOfValues = await this.numberOfValues;
		await ( await this.valueInput ).setValue( itemId );
		const itemEntry = await WikibaseMediaInfo.entitySelectorEntry;
		await itemEntry.waitForDisplayed( { timeout: searchTimeout, timeoutMsg: 'expected selected item entry for statement' } );
		await itemEntry.click();
		await browser.waitUntil( async () => await this.numberOfValues === numberOfValues + 1 );
	}

}

module.exports = StatementWidget;
