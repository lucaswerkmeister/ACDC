# AC/DC [![Build Status](https://travis-ci.com/lucaswerkmeister/ACDC.svg?branch=master)](https://travis-ci.com/lucaswerkmeister/ACDC)

**Add to Commons / Descriptive Claims** is a gadget for Wikimedia Commons
to add a collection of statements to a set of files.
See the [on-wiki documentation](https://commons.wikimedia.org/wiki/Help:Gadget-ACDC) for more information.

## Development

For local development, I usually load [this page](https://test-commons.wikimedia.org/wiki/Special:BlankPage?acdcShow=1) in Firefox,
then open the Scratchpad (<kbd><kbd>Shift</kbd>+<kbd>F4</kbd></kbd>), open `acdc.js` and run it (<kbd><kbd>Ctrl</kbd>+<kbd>R</kbd></kbd>).
After making code changes, I reload the file in Scratchpad
(it usually remembers the file name, making this as simple as <kbd><kbd>Ctrl</kbd>+<kbd>O</kbd></kbd>, then <kbd><kbd>Enter</kbd></kbd>)
and run it again.
(I typically don’t edit in Scratchpad directly.)
Similar steps should be possible in other browsers –
they just need to support all the modern JavaScript features AC/DC uses,
without Babel transpilation or core-js polyfills.

For deployment, run `make all` to build the Commons version of the script,
copy `dist/main.js` to the clipboard and save that on [`MediaWiki:Gadget-ACDC.js`](https://commons.wikimedia.org/wiki/MediaWiki:Gadget-ACDC.js).
Afterwards, copy the page revision from the “permanent link” in the sidebar
and tag the current commit as <code>r<var>revid</var></code>,
then push `master` and that tag to `origin`.

## License

As this script is published on Wikimedia Commons,
it falls under the Creative Commons Attribution-ShareAlike 3.0 Unported license
([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)).
Additionally, I place it under the Creative Commons Attribution-ShareAlike 4.0 International license
([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)),
and I’m open to publishing it under other free licenses too.

If you contribute to this script,
you agree to release your contributions under the same licenses,
and I may contact you in the future to request additional licenses.
