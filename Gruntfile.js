var path = require('path');

module.exports = function (grunt) {

    var initProps = {
            packageInfo : grunt.file.readJSON('package.json')
        };

    initProps.name = function() {
        return this.packageInfo.name;
    };

    require('load-grunt-config')(grunt, {
        configPath: path.join(__dirname, 'tasks/options'),
        config: {
            settings: initProps
        }
    });
    grunt.loadTasks('tasks');

    grunt.registerTask('default', function(){
        grunt.task.run('jshint');
        grunt.task.run('test');
    });

    grunt.task.renameTask('jasmine','test');
};
