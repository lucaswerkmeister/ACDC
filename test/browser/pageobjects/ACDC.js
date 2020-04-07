const WikibaseMediaInfo = require( './WikibaseMediaInfo' );
const StatementWidget = require( './StatementWidget' );

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

	get addStatementToAddButton() {
		return this.dialog
			.then( dialog => dialog.$( '.acdc-statementsDialog-statementsToAddField .wbmi-add-property .oo-ui-buttonElement-button' ) );
	}

	get addStatementToAddInput() {
		return this.dialog
			.then( dialog => dialog.$( '.acdc-statementsDialog-statementsToAddField .wbmi-entityview-add-statement-property-input .oo-ui-inputWidget-input' ) );
	}

	get addStatementToRemoveButton() {
		return this.dialog
			.then( dialog => dialog.$( '.acdc-statementsDialog-statementsToRemoveField .wbmi-add-property .oo-ui-buttonElement-button' ) );
	}

	get addStatementToRemoveInput() {
		return this.dialog
			.then( dialog => dialog.$( '.acdc-statementsDialog-statementsToRemoveField .wbmi-entityview-add-statement-property-input .oo-ui-inputWidget-input' ) );
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

	statementToAddWidget( index /* 1-indexed */ ) {
		return this.dialog
			.then( dialog => new StatementWidget(
				dialog.$( `.acdc-statementsDialog-statementsToAddField
                           .oo-ui-widget:nth-child(${index})
                           .wbmi-statements-widget` ) ) );
	}

	statementToRemoveWidget( index /* 1-indexed */ ) {
		return this.dialog
			.then( dialog => new StatementWidget(
				dialog.$( `.acdc-statementsDialog-statementsToRemoveField
                           .oo-ui-widget:nth-child(${index})
                           .wbmi-statements-widget` ) ) );
	}

	async setFileInputValue( value ) {
		await ( await this.fileInput ).setValue( value );
	}

	async addPropertyToAdd( propertyId ) {
		await ( await this.addStatementToAddButton ).click();
		const addStatementToAddInput = await this.addStatementToAddInput;
		await addStatementToAddInput.waitForDisplayed();
		await addStatementToAddInput.setValue( propertyId );
		const propertyEntry = await WikibaseMediaInfo.entitySelectorEntry;
		await propertyEntry.waitForDisplayed();
		await propertyEntry.click();
	}

	async addPropertyToRemove( propertyId ) {
		await ( await this.addStatementToRemoveButton ).click();
		const addStatementToRemoveInput = await this.addStatementToRemoveInput;
		await addStatementToRemoveInput.waitForDisplayed();
		await addStatementToRemoveInput.setValue( propertyId );
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
