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

	tagItem( index /* 1-indexed */ ) {
		return this.filesWidget
			.then( filesWidget => filesWidget.$( `.oo-ui-tagItemWidget:nth-child(${index})` ) );
	}

	tagItemText( index /* 1-indexed */ ) {
		return this.tagItem( index )
			.then( tagItem => tagItem.getText() );
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

	async submit() {
		const submitButton = await this.submitButton;
		await browser.waitUntil( async () => {
			const disabled = await submitButton.getAttribute( 'aria-disabled' );
			return disabled === 'false';
		} );
		await submitButton.click();
	}
}

module.exports = new ACDC();
