const WikibaseMediaInfo = require( './WikibaseMediaInfo' );
const StatementsWidget = require( './StatementsWidget' );

class ACDC {

	get portletLink() {
		return $( '#t-acdc' );
	}

	get dialog() {
		return $( '.acdc-statementsDialog' );
	}

	get filesWidget() {
		return this.dialog
			.then( dialog => dialog.$( '.acdc-filesWidget' ) );
	}

	get fileInput() {
		return this.filesWidget
			.then( filesWidget => filesWidget.$( '.acdc-fileInputWidget-input' ) );
	}

	get tagItem() {
		return this.filesWidget
			.then( filesWidget => filesWidget.$( '.oo-ui-tagItemWidget' ) );
	}

	get tagItemText() {
		return this.tagItem
			.then( tagItem => tagItem.getText() );
	}

	get addStatementButton() {
		return this.dialog
			.then( dialog => dialog.$( '.wbmi-add-property .oo-ui-buttonElement-button' ) );
	}

	get addStatementInput() {
		return this.dialog
			.then( dialog => dialog.$( '.wbmi-entityview-add-statement-property .oo-ui-inputWidget-input' ) );
	}

	get submitButton() {
		return this.dialog
			.then( dialog => dialog.$( '.oo-ui-processDialog-actions-primary .oo-ui-buttonElement-button' ) );
	}

	statementsWidget( index /* 1-indexed */ ) {
		return this.dialog
			.then( dialog => new StatementsWidget(
				dialog.$( `.acdc-statementsDialog-statementsField
                           .oo-ui-widget:nth-child(${index})
                           .wbmi-statements-widget` ) ) );
	}

	async setFileInputValue( value ) {
		await ( await this.fileInput ).setValue( value );
	}

	async addProperty( propertyId ) {
		await ( await this.addStatementButton ).click();
		const addStatementInput = await this.addStatementInput;
		await addStatementInput.waitForDisplayed();
		await addStatementInput.setValue( propertyId );
		const propertyEntry = await WikibaseMediaInfo.entitySelectorEntry;
		await propertyEntry.waitForDisplayed();
		await propertyEntry.click();
	}
}

module.exports = new ACDC();
