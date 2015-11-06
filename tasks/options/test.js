var path = require('path');

var JUnitXmlReporter = require('jasmine-reporters').JUnitXmlReporter;

module.exports = {
    unit: {
        options: {
            configure: function(jasmine) {
                var junitReporter = new JUnitXmlReporter({
                    savePath: path.resolve(__dirname, '../../reports/unit')
                });

                jasmine.addReporter(junitReporter);
            }
        },
        src: ['test/unit/**/*.spec.js']
    },
    e2e: {
        options: {
            configure: function(jasmine) {
                var junitReporter = new JUnitXmlReporter({
                    savePath: path.resolve(__dirname, '../../reports/e2e'),
                    consolidateAll: false
                });

                jasmine.addReporter(junitReporter);
            }
        },
        src: ['test/e2e/**/*.spec.js']
    }
};
