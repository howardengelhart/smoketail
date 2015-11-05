module.exports = {
    test: {
        options: {
            debounceDelay : 10000,
            atBegin : true
        },
        files: [
            'index.js',
            'bin/**/*.js',
            'lib/**/*.js',
            'test/**/*.js' 
        ],
        tasks: ['jshint', 'test:unit' ]
    }
};
