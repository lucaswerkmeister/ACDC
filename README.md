# AC/DC

**Add to Commons / Descriptive Claims** is a gadget for Wikimedia Commons
to add a collection of statements to a set of files.
See the [on-wiki documentation](https://commons.wikimedia.org/wiki/Special:MyLanguage/Help:Gadget-ACDC) for more information.

## Development

For local development, I usually load `manifest.json` as a temporary extension in `about:debugging`,
then open [this page](https://test-commons.wikimedia.org/wiki/Special:BlankPage?acdcShow=1) and test the gadget there.
Code changes to `acdc.js` become effective after a reload of the page
(there’s no need to reload the temporary extension).
Note that this is only possible in Firefox –
I’m not aware of a way for a WebExtension to run code in the page content in Chrome or other browsers.

For deployment, copy `acdc.js` to the clipboard
and save that on [`MediaWiki:Gadget-ACDC.js`](https://commons.wikimedia.org/wiki/MediaWiki:Gadget-ACDC.js).
Afterwards, copy the page revision from the “permanent link” in the sidebar
and tag the current commit as <code>r<var>revid</var></code>,
then push `main` and that tag to `origin`.

All dependencies in `package.json` should be `devDependencies`.
(Prior to June 2025, non-dev dependencies were those required to build the gadget,
but the build step is no longer necessary and as such only dev / test dependencies remain.)

## License

As this script is published on Wikimedia Commons,
it falls under the Creative Commons Attribution-ShareAlike 4.0 International license
([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)).
(Earlier versions also fell under the Creative Commons Attribution-ShareAlike 3.0 Unported license
([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/));
those versions were explicitly dual-licensed under CC BY-SA 4.0 as well.)
I’m also open to publishing it under other free licenses.

If you contribute to this script,
you agree to release your contributions under the same license,
and I may contact you in the future to request additional licenses.
