# smoketail
Library and utility for tailing AWS CloudWatch Logs.
## Installation

      # utility
      $ npm install -g smoketail
      
      # library
      $ npm install smoketail

## Utility
The smoketail utility is a command line app that allows you to download or follow CloudWatch Log Events.  Authorization is handled via the default mechanisms (```~/.aws/credentials```) used by the [AWS Node.js SDK](https://aws.amazon.com/sdk-for-node-js/) .

```

  Usage: smoketail [options] <logGroupName>

  Options:

    -h, --help                       output usage information
    -V, --version                    output the version number
    -c, --credentials <name>         Profile name from ~/.aws/credentials ini.
    -i, --interleaved                Interleave the log results. (auto on if using -f).
    -f, --follow                     When at the end of the logstream, poll for more messages.
    -p, --pattern <pattern>          CloudWatch Logs filter pattern.
    -r, --region <region>            Set the AWS region for your logGroup. Default is us-east-1.
    -s, --streams <s1,s2,s3>         Comma spearateed list of logStreamNames.
    -t, --time-range <start>..<end>  Start and end range for events.

  Getting Started
  ---------------
  smoketail is a utility wrapping calls to the AWS node.js api CloudWatchLogs::filterLogEvents.
  Authenticate via default methods supported by the sdk. More information available at: 
  https://aws.amazon.com/sdk-for-node-js/ 

  Time Ranges
  -----------
  Either end of a time range is optional.  Accepts string and int formatstaken by the Javascript
  Date constructor. If passed a negative, will interpet as now - seconds (ie -300 is 5 minutes ago).

  Examples:

    $ smoketail my/logGroup -t -60
    $ smoketail my/logGroup -t -300..-60
    $ smoketail my/logGroup -t 2015-01-01T14:45:00Z..2015-01-01T15:00:00Z
    $ smoketail my/logGroup -t ..2015-01-01T15:00:00Z

```

## Library
The smoketail library provides objects for iterating through or streaming CloudWatchLogData.

### CWLogFilterEventStream
A readable stream for getting logEvents.  The constructor takes two paramaters, a Filter Object (passed to [CloudWatchLogs::filterLogEvents](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#filterLogEvents-property)) and an AWS Config  object (passed to [CloudWatchLogs::constructor](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#constructor-property)).  

```
var CWLogFilterEventStream = require('smoketail').CWLogFilterEventStream;

var filterOpts = {
    logGroupName : 'myGroup',
    logStreamNames: ['stream1','stream2'],
    startTime: 1451606400000,
    follow: true // The follow parameter is specific to smoketail.  If set, once 
                 // all events are returned, the stream will be kept open an poll
                 // CloudWatchLogs for follow-on events using the current filter
                 // parameters.  Otherwise the 'end' event fill fire when all events
                 // are retuned.
};

var awsOpts = {
    region : 'us-east-1' // Note this is the default if the awsOpts param is ommitted.
};

var eventStream = new CWLogFilterEventStream(filterOpts,awsOpts);
eventStream.on('error', function(err){
    console.log(err);
});

eventStream.on('end', function(){
    console.log('The stream is over.');
});

eventStream.on('data',function(eventObject){
    ///**IMPORTANT**:  All data is returned in objectMode.
    console.log(
        'Timestamp: ', new Date(eventObject.timestamp),
        'Message: ', eventObject.message
    );
});

setTimeout(function(){
    eventStream.close();  // Close method will close stream, end app if nothing else is open
}, 30000);

```

Because all data presented by the CWLogFilterEventStream is raw objects, it cannot be piped directly to other streams expecting data in string or buffers.  To faciliate this, the CWLogEventToMessage transformer is available.  As a convenience, a default instantiation of the transformer object is included in the library (```.logEventToMessage```).

```
var CWLogFilterEventStream = require('smoketail').CWLogFilterEventStream,
    logEventToMessage      = require('smoketail').logEventToMessage;

var eventStream = new CWLogFilterEventStream({...},{...});
eventStream.pipe(logEventToMessage).pipe(process.stdout);
```
### CWLogFilter
A promise based cursor-like object wrapping calls to the AWS filterLogEvents api.  The CWLogFilterStream uses the CWLogFilter internally to implement its calls to the AWS api.
```
var CWLogFilter = require('smoketail').CWLogFilter;

var filter = new CWLogFilter( /* { region : 'us-east-1' } */);

// open takes the same parameters as a call to filterLogEvents
filter.open({
    logGroupName : 'myGroup',
    logStreamNames: ['stream1','stream2'],
    startTime: 1451606400000
})
.then(results){
    results.events.forEach(event){
        console.log(event.message);
    }
})
.catch(function(err){
    console.log(err);
});
```
If your logs query is going to require paginating results, the CWLogFilter object has a ```.next``` method that helps handle iteration with tokens.   Calls to ```.next``` will use the filter parameters passed to ```.open``` along with the ```.nextToken``` on a ```filterLogEvents``` response to get the next page of rsults.

```
var CWLogFilter = require('smoketail').CWLogFilter;

var filter = new CWLogFilter( /* { region : 'us-east-1' } */);

// iterate wlll call next() and repeat until no more events
function iterate(results){
    if (!results || results.event) {
        return filter;
    }
    results.events.forEach(function(event){
        console.log(event.message);
    });
    
    if (filter.eof()){
        return filter;
    }
    return filter.next().then(iterateFilter);
}

// open takes the same parameters as a call to filterLogEvents
filter.open({ ... })
.then(iterate)
.catch(function(err){
    console.log(err);
});
```
