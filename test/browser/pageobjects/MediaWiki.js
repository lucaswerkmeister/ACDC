class MediaWiki {

	get sidebar() {
		return $( '#mw-panel' );
	}

	get sidebarCheckbox() {
		return $( '#mw-sidebar-checkbox' );
	}

	get sidebarButton() {
		return $( '#mw-sidebar-button' );
	}

	async ensureSidebarShown() {
		await ( await this.sidebar ).waitForExist();
		const sidebarCheckbox = await this.sidebarCheckbox;
		if ( await sidebarCheckbox.isExisting() && !( await sidebarCheckbox.isSelected() ) ) {
			await ( await this.sidebarButton ).click();
			await browser.pause( 100 ); // wait for animation to complete
		}
	}
}

module.exports = new MediaWiki();
