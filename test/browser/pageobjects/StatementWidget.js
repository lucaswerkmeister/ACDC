const WikibaseMediaInfo = require( './WikibaseMediaInfo' );

class StatementWidget {

	constructor( element ) {
		this.element = element;
	}

	get valueInput() {
		return this.element
			.then( element => element.$( '.wbmi-statement-input input' ) );
	}

	async waitForDisplayed() {
		await ( await this.element ).waitForDisplayed();
	}

	async addValue( itemId ) {
		await ( await this.valueInput ).setValue( itemId );
		const itemEntry = await WikibaseMediaInfo.entitySelectorEntry;
		await itemEntry.waitForDisplayed();
		await itemEntry.click();
	}

}

module.exports = StatementWidget;
