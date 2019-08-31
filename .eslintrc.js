const notES2017Rules = require( 'eslint-config-wikimedia/language/not-es2017' );

module.exports = {
    'env': {
        'browser': true,
        'es6': true,
    },
    'extends': [
        'wikimedia',
        'wikimedia/jquery',
        'wikimedia/language/es2019',
    ],
    'globals': {
        'mediaWiki': 'readable',
        'jQuery': 'readable',
        'OO': 'readable',
        'wikibase': 'readable',
    },
    'rules': {
        'arrow-parens': [ 'error', 'as-needed' ],
        'comma-dangle': [ 'error', 'always-multiline' ],
        'no-irregular-whitespace': [ 'error', { 'skipStrings': true, 'skipComments': true } ],
        // we polyfill Array.flatMap
        'no-extend-native': [ 'error', { 'exceptions': [ 'Array' ] } ],
        'no-restricted-properties': notES2017Rules.rules['no-restricted-properties'].filter(
            r => typeof r !== 'object' || r.property !== 'flatMap' ),
    }
};
