var CWLogFilterEventStream = require('../lib/cwlog').CWLogFilterEventStream,
    CWLogEventToMessage    = require('../lib/cwlog').CWLogEventToMessage,
    filter,toMessage;

toMessage = new CWLogEventToMessage( { crunchTabs : false });

filter = new CWLogFilterEventStream({
    logGroupName : '/aws/lambda/importPlayerRequests',
    startTime : (new Date()).valueOf() - (3600000 /* one hour worth of ms */),
    interLeaved: true,
    follow: true
});

filter.on('end', function(){
    console.log('received end');
});

filter.on('close', function(){
    console.log('received close');
});

filter.on('error', function(err){
    console.log(err.stack);
});

filter.pipe(toMessage).pipe(process.stdout);
