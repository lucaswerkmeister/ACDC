class MediaWiki {

	async ensureToolsShown() {
		const toolsInput = await $( '#vector-page-tools-dropdown-checkbox' );
		if ( !( await toolsInput.isSelected() ) ) {
			await toolsInput.click();
		}
	}
}

module.exports = new MediaWiki();
