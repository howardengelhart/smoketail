describe('CWLogFilterStream', function() {
    var q                      = require('q'),
        util                   = require('util'),
        Transform              = require('stream').Transform,
        CloudWatchLogs         = require('aws-sdk').CloudWatchLogs,
        CWLogFilterEventStream = require('../../lib/cwlog').CWLogFilterEventStream,
        CWLogEventToMessage    = require('../../lib/cwlog').CWLogEventToMessage,
        testLogGroupName       = 'smoketail/e2e/CWLogFilterStream',
        cwlogs, tokens = {};

    function MockPipe(spy){
        this._spy=spy;
        Transform.call(this);
    }
    util.inherits(MockPipe, Transform);

    MockPipe.prototype._transform = function(chunk, encoding, done) {
        this._spy(chunk.toString());
        done();
    };

    function sendLogEvents(events,delay) {
            var index = 0;
            function putLogEvents(){
                var params = events[index++];
                if (!params) {
                    return q();
                }

                params.logGroupName = params.logGroupName || testLogGroupName;

                if (tokens[params.logStreamName]) {
                    params.sequenceToken = tokens[params.logStreamName];
                }

                return q.ninvoke(cwlogs,'putLogEvents',params)
                    .then(function(res){
                        tokens[params.logStreamName] = res.nextSequenceToken;
                    })
                    .then(function(){
                        if (delay) {
                            return q.delay(delay);
                        }
                        return q();
                    })
                    .then(putLogEvents);
            }

            return putLogEvents();
    }

    function wait3Seconds() { return q.delay(3000); }
    function wait5Seconds() { return q.delay(5000); }

    beforeAll(function(done){
        cwlogs = new CloudWatchLogs({  apiVersion : '2014-03-28', region : 'us-east-1' });

        function createLogGroup(){
            return q.ninvoke(cwlogs,'createLogGroup',{ logGroupName: testLogGroupName });
        }

        function createLogStreams() {
            return q.all(['stream1','stream2','stream3'].map(function(streamName){
                return q.ninvoke(cwlogs,'createLogStream',{
                    logGroupName : testLogGroupName,
                    logStreamName : streamName
                })
            }));
        }

        createLogGroup()
        .then(createLogStreams)
        .then(done,done.fail);
    } );

    afterAll(function(done){
        q.ninvoke(cwlogs,'deleteLogGroup',{ logGroupName: testLogGroupName })
        .then(done,done.fail);
    });

    it('gets log events and finishes if not following',function(done){
        var dtBase = (Math.round(Date.now() / 1000) * 1000) - 30000,
            logEvents = [
                {  
                    logStreamName: 'stream1',
                    logEvents: [
                        {  message:'test1 - s1,m1',timestamp:dtBase },
                        {  message:'test1 - s1,m2',timestamp:dtBase+3000 },
                        {  message:'test1 - s1,m3',timestamp:dtBase+6000 },
                        {  message:'test1 - s1,m4',timestamp:dtBase+9000 }
                    ]
                },
                {
                    logStreamName: 'stream2',
                    logEvents: [
                        {  message:'test1 - s2,m1',timestamp:dtBase+1000 },
                        {  message:'test1 - s2,m2',timestamp:dtBase+4000 },
                        {  message:'test1 - s2,m3',timestamp:dtBase+7000 },
                        {  message:'test1 - s2,m4',timestamp:dtBase+10000 }
                    ]
                },
                {
                    logStreamName: 'stream3',
                    logEvents: [
                        {  message:'test1 - s3,m1',timestamp:dtBase+2000 },
                        {  message:'test1 - s3,m2',timestamp:dtBase+5000 },
                        {  message:'test1 - s3,m3',timestamp:dtBase+8000 },
                        {  message:'test1 - s3,m4',timestamp:dtBase+11000 }
                    ]
                }
            ];

        sendLogEvents(logEvents)
        .then(wait3Seconds)
        .then(function(){
            var deferred = q.defer(),
                filter = new CWLogFilterEventStream({
                    logGroupName : testLogGroupName,
                    filterPattern: '"test1"',
                    interLeaved: true
                }),
                closeSpy = jasmine.createSpy('close'),
                dataSpy  = jasmine.createSpy('data');

            filter.on('close',  closeSpy);
            filter.on('data',   dataSpy);
            filter.on('error',  deferred.reject);
            filter.on('end', function(){
                expect(closeSpy).toHaveBeenCalled();
                expect(dataSpy.calls.count()).toEqual(12);
                expect(dataSpy.calls.allArgs()).toEqual([
                    [jasmine.objectContaining(logEvents[0].logEvents[0])],
                    [jasmine.objectContaining(logEvents[1].logEvents[0])],
                    [jasmine.objectContaining(logEvents[2].logEvents[0])],

                    [jasmine.objectContaining(logEvents[0].logEvents[1])],
                    [jasmine.objectContaining(logEvents[1].logEvents[1])],
                    [jasmine.objectContaining(logEvents[2].logEvents[1])],

                    [jasmine.objectContaining(logEvents[0].logEvents[2])],
                    [jasmine.objectContaining(logEvents[1].logEvents[2])],
                    [jasmine.objectContaining(logEvents[2].logEvents[2])],

                    [jasmine.objectContaining(logEvents[0].logEvents[3])],
                    [jasmine.objectContaining(logEvents[1].logEvents[3])],
                    [jasmine.objectContaining(logEvents[2].logEvents[3])]
                ]);
                deferred.resolve();
            });
            return deferred.promise;
        })
        .then(done,done.fail);
    },10000);

    it('follows logevents if set to follow',function(done){
        var dtBase = (Math.round(Date.now() / 1000) * 1000) - 30000,
            logEvents = [
                {  logStreamName: 'stream1', logEvents: [
                    {  message:'test2 - s1,m1',timestamp:dtBase } ] },
                {  logStreamName: 'stream2', logEvents: [
                    {  message:'test2 - s2,m1',timestamp:dtBase+1000} ] },
                {  logStreamName: 'stream3', logEvents: [
                    {  message:'test2 - s3,m1',timestamp:dtBase+2000 } ] },
                {  logStreamName: 'stream1', logEvents: [
                    {  message:'test2 - s1,m2',timestamp:dtBase+3000 } ] },
                {  logStreamName: 'stream2', logEvents: [
                    {  message:'test2 - s2,m2',timestamp:dtBase+4000 } ] }
            ];

        var filter = new CWLogFilterEventStream({
                logGroupName : testLogGroupName,
                filterPattern : '"test2"',
                interLeaved: true,
                follow: true
            }),
            closeSpy = jasmine.createSpy('close'),
            dataSpy  = jasmine.createSpy('data');

        filter.on('close',  closeSpy);
        filter.on('data',   dataSpy);
        filter.on('error',  done.fail);
        filter.on('end', function(){
            expect(closeSpy).toHaveBeenCalled();
            expect(dataSpy.calls.count()).toEqual(5);
            expect(dataSpy.calls.allArgs()).toEqual([
                [jasmine.objectContaining(logEvents[0].logEvents[0])],
                [jasmine.objectContaining(logEvents[1].logEvents[0])],
                [jasmine.objectContaining(logEvents[2].logEvents[0])],
                [jasmine.objectContaining(logEvents[3].logEvents[0])],
                [jasmine.objectContaining(logEvents[4].logEvents[0])]
            ]);
            done();
        });

        sendLogEvents(logEvents,500)
        .then(wait3Seconds)
        .then(function(){
            filter.close();
        })
        .catch(done.fail);
    },10000);

    it('works with the CWLogEventToMessage Transformer',function(done){
        // Note, CWLogEventToMesage will prepend messages with the formatted timestamp
        // if the message does not already begin with a formatted timestamp.

        function iso(utime){ return (new Date(utime)).toISOString(); }
        var dtBase = (Math.round(Date.now() / 1000) * 1000) - 30000,
            logEvents = [
                {  logStreamName: 'stream1', logEvents: [
                    {  message:iso(dtBase-500) + ' test3 - s1,m1',timestamp:dtBase } ] },
                {  logStreamName: 'stream2', logEvents: [
                    {  message:iso(dtBase+500) + ' test3 - s2,m1',timestamp:dtBase+1000} ] },
                {  logStreamName: 'stream3', logEvents: [
                    {  message:iso(dtBase+1500) + ' test3 - s3,m1',timestamp:dtBase+2000 } ] },
                {  logStreamName: 'stream1', logEvents: [
                    {  message:'test3 - s1,m2',timestamp:dtBase+3000 } ] },
                {  logStreamName: 'stream2', logEvents: [
                    {  message:'test3 - s2,m2',timestamp:dtBase+4000 } ] }
            ];

        var filter = new CWLogFilterEventStream({
                logGroupName : testLogGroupName,
                filterPattern : '"test3"',
                interLeaved: true,
                follow: true
            }),
            toMessage = new CWLogEventToMessage( ),
            closeSpy = jasmine.createSpy('close'),
            dataSpy  = jasmine.createSpy('data'),
            mockPipe = new MockPipe(dataSpy);

        filter.on('close',  closeSpy);
        filter.on('error',  done.fail);
        filter.on('end', function(){
            expect(closeSpy).toHaveBeenCalled();
            expect(dataSpy.calls.count()).toEqual(5);
            expect(dataSpy.calls.allArgs()).toEqual([
                [logEvents[0].logEvents[0].message + '\n'],
                [logEvents[1].logEvents[0].message + '\n'],
                [logEvents[2].logEvents[0].message + '\n'],
                [iso(dtBase+3000) + ' ' + logEvents[3].logEvents[0].message + '\n'],
                [iso(dtBase+4000) + ' ' + logEvents[4].logEvents[0].message + '\n']
            ]);
            done();
        });
        filter.pipe(toMessage).pipe(mockPipe);

        sendLogEvents(logEvents,500)
        .then(wait5Seconds)
        .then(function(){
            filter.close();
        })
        .catch(done.fail);
    },10000);


});
