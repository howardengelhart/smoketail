#!/usr/bin/env node
var program   = require('commander'),
    pkg       = require('../package.json'),
    cwl       = require('../lib/cwlog'),
    filter, filterOpts = { }, awsOpts;


process.on('uncaughtException', function(err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
});

function parseDateArg(v) {
    if (!v)                         { return new Date(NaN); }
    if (v.toLowerCase() === 'now')  { return new Date(); }
    if (v.match(/^-\d+/))           { return new Date(Date.now() + (parseInt(v,10) * 1000)); }
    if (v.match(/^\d+$/))           { return new Date(parseInt(v,10)); }
    return new Date(v);
}

program
    .usage('[options] <logGroupName>')
    .version(pkg.version)
    .option('-c, --credentials <name>', 'Profile name from ~/.aws/credentials ini.')
    .option('-i, --interleaved', 'Interleave the log results. (auto on if using -f).')
    .option('-f, --follow', 'When at the end of the logstream, ' +
        'poll for more messages.')
    .option('-p, --pattern <pattern>', 'CloudWatch Logs filter pattern.')
    .option('-r, --region <region>','Set the AWS region for your logGroup. ' +
        'Default is us-east-1.','us-east-1')
    .option('-s, --streams <s1,s2,s3>','Comma spearateed list of logStreamNames.',
            function(v) { return v.split(','); })
    .option('-t, --time-range <start>..<end>','Start and end range for events.',
            function(v) { return v.split('..').map(parseDateArg);})
    .action(function(logGroupName){
        filterOpts.logGroupName = logGroupName;
    });

program.on('--help',function(){
    console.log('  Getting Started');
    console.log('  ---------------');
    console.log('  smoketail is a utility wrapping calls to the AWS node.js api ' +
                  'CloudWatchLogs::filterLogEvents.' );
    console.log('  Authenticate via default methods supported by the sdk.' +
                 ' More information available at: ');
    console.log('  https://aws.amazon.com/sdk-for-node-js/ ' );
    console.log('');
    console.log('  Time Ranges');
    console.log('  -----------');
    console.log('  Either end of a time range is optional.  Accepts string and int formats' +
                  'taken by the Javascript');
    console.log('  Date constructor. If passed a negative, will interpet as now - seconds' +
                 ' (ie -300 is 5 minutes ago).');
    console.log('');
    console.log('  Examples:');
    console.log('');
    console.log('    $ smoketail my/logGroup -t -60');
    console.log('    $ smoketail my/logGroup -t -300..-60');
    console.log('    $ smoketail my/logGroup -t 2015-01-01T14:45:00Z..2015-01-01T15:00:00Z');
    console.log('    $ smoketail my/logGroup -t ..2015-01-01T15:00:00Z');
    console.log('');
});

program.parse(process.argv);


if (!filterOpts.logGroupName) {
    program.help();
}

if (program.interleaved) {
    filterOpts.interLeaved = true;
}

if (program.pattern) {
    filterOpts.filterPattern = program.pattern;
}

awsOpts = {
    region : program.region,
    profile: program.credentials
};

if (program.streams) {
    filterOpts.logStreamNames = program.streams;
}

if (program.timeRange) {
    if (program.timeRange[0]) {
        if (!isNaN(program.timeRange[0].valueOf())){
            filterOpts.startTime = program.timeRange[0].valueOf();
        }
    }

    if (program.timeRange[1]) {
        if (!isNaN(program.timeRange[1].valueOf())){
            filterOpts.endTime = program.timeRange[1].valueOf();
        }
    }
}

if (program.follow) {
    if (filterOpts.endTime) {
        throw new Error('Cannot use --follow with an ending time range.');
    }
    filterOpts.follow = true;
    filterOpts.interLeaved = true;
}

filter = new cwl.CWLogFilterEventStream(filterOpts,awsOpts);

filter.on('error', function(err){
    process.stderr.write(err.message + '\n');
    process.exit(1);
});

filter.pipe(cwl.logEventToMessage).pipe(process.stdout);
