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

	async setFileInputValue( value ) {
		await ( await this.fileInput ).setValue( value );
	}
}

module.exports = new ACDC();
