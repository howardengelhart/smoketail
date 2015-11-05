var Jasmine = require('jasmine');

var NAME = 'jasmine';
var DESCRIPTION = 'Runs jasmine unit tests via the official jasmine node runner';

module.exports = function nodeJamine(grunt) {
    grunt.registerMultiTask(NAME, DESCRIPTION, function jasmineTask() {
        var done = this.async();
        var options = this.options({
            configure: function() {},
            defaultReporter: {}
        });
        var files = this.filesSrc;
        var jasmine = new Jasmine();

        jasmine.loadConfig({
            spec_files: files, // jshint ignore:line
            spec_dir: '' // jshint ignore:line
        });
        options.configure(jasmine);
        jasmine.configureDefaultReporter(options.defaultReporter);
        jasmine.onComplete(done);

        jasmine.execute();
    });
};
