const WikibaseMediaInfo = require( './WikibaseMediaInfo' );

class StatementWidget {

	constructor( element ) {
		this.element = element;
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

	async waitForDisplayed() {
		await ( await this.element ).waitForDisplayed();
	}

	async addValue( itemId ) {
		const numberOfValues = await this.numberOfValues;
		await ( await this.valueInput ).setValue( itemId );
		const itemEntry = await WikibaseMediaInfo.entitySelectorEntry;
		await itemEntry.waitForDisplayed();
		await itemEntry.click();
		await browser.waitUntil( async () => await this.numberOfValues === numberOfValues + 1 );
	}

}

module.exports = StatementWidget;
