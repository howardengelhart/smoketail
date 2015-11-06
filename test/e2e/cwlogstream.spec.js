describe('CWLogFilterStream', function() {
    var q   = require('q'),
        CloudWatchLogs         = require('aws-sdk').CloudWatchLogs,
        CWLogFilterEventStream = require('../../lib/cwlog').CWLogFilterEventStream,
        CWLogEventToMessage    = require('../../lib/cwlog').CWLogEventToMessage,
        testLogGroupName       = 'smoketail/e2e/CWLogFilterStream',
        testLogEvents, cwlogs;

    beforeAll(function(done){
        cwlogs = new CloudWatchLogs({  apiVersion : '2014-03-28', region : 'us-east-1' });

        testLogEvents = {
            stream1: [
                {  message:'2015-11-01T10:11:11.000Z s1,m1',timestamp:1446372671000 },
                {  message:'2015-11-01T10:11:14.000Z s1,m2',timestamp:1446372674000 },
                {  message:'2015-11-01T10:11:17.000Z s1,m3',timestamp:1446372677000 },
                {  message: 'stream1, fin', timestamp: 1446372680000 }
            ],
            stream2: [
                {  message:'2015-11-01T10:11:12.000Z s2,m1',timestamp:1446372672000 },
                {  message:'2015-11-01T10:11:15.000Z s2,m2',timestamp:1446372675000 },
                {  message:'2015-11-01T10:11:18.000Z s2,m3',timestamp:1446372678000 },
                {  message: 'stream2, fin', timestamp: 1446372681000 }
            ],
            stream3: [
                {  message:'2015-11-01T10:11:13.000Z s3,m1',timestamp:1446372673000 },
                {  message:'2015-11-01T10:11:16.000Z s3,m2',timestamp:1446372676000 },
                {  message:'2015-11-01T10:11:19.000Z s3,m3',timestamp:1446372679000 },
                {  message: 'stream2, fin', timestamp: 1446372682000 }
            ]
        };

        function createLogGroup(){
            return q.ninvoke(cwlogs,'createLogGroup',{ logGroupName: testLogGroupName });
        }

        function createLogStreams() {
            return q.all(Object.keys(testLogEvents).map(function(streamName){
                return q.ninvoke(cwlogs,'createLogStream',{
                    logGroupName : testLogGroupName,
                    logStreamName : streamName
                })
            }));
        }

        function createLogEvents(){
            return q.all(Object.keys(testLogEvents).map(function(streamName){
                var params = { logGroupName : testLogGroupName, logStreamName: streamName,
                    logEvents : testLogEvents[streamName] };
                return q.ninvoke(cwlogs,'putLogEvents',params)
            }));
        }

        function wait2Seconds() {
            return q.delay(2000);
        }

        createLogGroup()
        .then(createLogStreams)
        .then(createLogEvents)
        .then(wait2Seconds)
        .then(done,done.fail);
    } );

    afterAll(function(done){
        q.ninvoke(cwlogs,'deleteLogGroup',{ logGroupName: testLogGroupName })
        .then(done,done.fail);
    });

    it('gets log events and finishes if not following',function(done){
        var filter = new CWLogFilterEventStream({
                logGroupName : testLogGroupName,
                interLeaved: true
            }),
            closeSpy = jasmine.createSpy('close'),
            dataSpy  = jasmine.createSpy('data');

        filter.on('close',  closeSpy);
        filter.on('data',   dataSpy);
        filter.on('error',  done.fail);
        filter.on('end', function(){
            expect(closeSpy).toHaveBeenCalled();
            expect(dataSpy.calls.count()).toEqual(12);
            expect(dataSpy.calls.allArgs()).toEqual([
                [jasmine.objectContaining(testLogEvents.stream1[0])],
                [jasmine.objectContaining(testLogEvents.stream2[0])],
                [jasmine.objectContaining(testLogEvents.stream3[0])],
                
                [jasmine.objectContaining(testLogEvents.stream1[1])],
                [jasmine.objectContaining(testLogEvents.stream2[1])],
                [jasmine.objectContaining(testLogEvents.stream3[1])],
                
                [jasmine.objectContaining(testLogEvents.stream1[2])],
                [jasmine.objectContaining(testLogEvents.stream2[2])],
                [jasmine.objectContaining(testLogEvents.stream3[2])],
                
                [jasmine.objectContaining(testLogEvents.stream1[3])],
                [jasmine.objectContaining(testLogEvents.stream2[3])],
                [jasmine.objectContaining(testLogEvents.stream3[3])]
            ]);
            done();
        });
    });

    it('follows logevents if set to follow',function(done){
        var filter = new CWLogFilterEventStream({
                logGroupName : testLogGroupName,
                filterPattern : '"follow-test"',
                interLeaved: true,
                follow: true,
                followInterval: 500
            }),
            closeSpy = jasmine.createSpy('close'),
            dataSpy  = jasmine.createSpy('data'),
            testEvents = [
                { logStreamName:'stream1',message:'follow-test s1,m1',timestamp:144637269000 },
                { logStreamName:'stream1',message:'follow-test s1,m2',timestamp:144637269300 },
                { logStreamName:'stream1',message:'follow-test s1,m3',timestamp:144637269600 },
                { logStreamName:'stream2',message:'follow-test s2,m1',timestamp:144637269100 },
                { logStreamName:'stream2',message:'follow-test s2,m2',timestamp:144637269400 },
                { logStreamName:'stream2',message:'follow-test s2,m3',timestamp:144637269700 },
                { logStreamName:'stream3',message:'follow-test s3,m1',timestamp:144637269200 },
                { logStreamName:'stream3',message:'follow-test s3,m2',timestamp:144637269500 },
                { logStreamName:'stream3',message:'follow-test s3,m3',timestamp:144637269800 }
            ];
        
        filter.on('close',  closeSpy);
        filter.on('data',   dataSpy);
        filter.on('error',  done.fail);

        filter.on('end', function(){
            expect(closeSpy).toHaveBeenCalled();
            expect(dataSpy.calls.count()).toEqual(8);
            done();
        });
       
        function sendLogEvents() {
            function wait() { return q.delay(250); }
            function putLogEvents(){
                var logevent = testEvents.shift();
                if (!logevent) {
                    return q();
                }
                var params = {
                    logGroupName  : testLogGroupName,
                    logStreamName : logevent.logStreamName,
                    logEvents: [
                        { message : logevent.message, timestamp : logevent.timestamp }
                    ]
                } 
                return q.ninvoke(cwlogs,'putLogEvents',params).then(wait).then(putLogEvents)
                    .catch(function(e){
                        console.log(params);
                        return q.reject(e);
                    });
            }
            
            return putLogEvents();
        }

        setTimeout(function(){
            filter.close();
        }, 3500);

        sendLogEvents().catch(done.fail);
    },10000);
});
