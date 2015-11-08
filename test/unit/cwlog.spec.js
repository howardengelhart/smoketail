describe('cwlog', function() {
    jasmine.clock().install();
    var cwlog, aws, q, mockCloudWatchLogs;
    beforeEach(function(){
        for (var m in require.cache){ delete require.cache[m]; };
        aws     = require('aws-sdk');
        q       = require('q');

        mockCloudWatchLogs = {
            filterLogEvents : jasmine.createSpy('filterLogEvents')
        };
        spyOn(require.cache[require.resolve('aws-sdk')].exports,'CloudWatchLogs')
            .and.callFake(function(opts) {
            return mockCloudWatchLogs;
        });
        cwlog = require('../../lib/cwlog');
    });

    describe('util',function(){
        describe('.copyFilterParams',function(){
            it('copies filter params',function(){
                var params={logGroupName:'toby',logStreamNames:['stream1','stream2']},
                    copy = cwlog.util.copyFilterParams(params);
                expect(copy).not.toBe(params);
                expect(copy).toEqual(jasmine.objectContaining({
                    logGroupName    : 'toby',
                    logStreamNames  : [ 'stream1', 'stream2' ]
                }));
                expect(copy.logStreamNames).not.toBe(params.logStreamNames);
            });

            it('ignores non params',function(){
                var params={logGroupName:'toby',logStreamNames:['stream1','stream2'],
                    snickerDoodle : true},
                    copy = cwlog.util.copyFilterParams(params);
                expect(copy).not.toBe(params);
                expect(copy).toEqual(jasmine.objectContaining({
                    logGroupName    : 'toby',
                    logStreamNames  : [ 'stream1', 'stream2' ]
                }));
                expect(copy.snickerDoodle).not.toBeDefined();
            });
        });

        describe('.createCWLogFilter',function(){
            it('creates a CWLogFilter',function(){
                var f = cwlog.util.createCWLogFilter();
                expect(f.constructor).toBe(cwlog.CWLogFilter);
                expect(f._cwLogs).toBeDefined();
                expect(aws.CloudWatchLogs).toHaveBeenCalledWith({
                    apiVersion : '2014-03-28',
                    region     : 'us-east-1'
                });
            });

            it('passes along options',function(){
                var o = cwlog.util.createCWLogFilter({
                    apiVersion:'foo',region:'us2',blah:'blah'
                });
                expect(aws.CloudWatchLogs).toHaveBeenCalledWith({
                    apiVersion : '2014-03-28',
                    region     : 'us2',
                    blah       : 'blah'
                });
            });
        });
    });

    describe('CWLogFilter',function(){
        describe('constructor',function(){
            it('initializes without any options set',function(){
                var o = new cwlog.CWLogFilter();
                expect(aws.CloudWatchLogs).toHaveBeenCalledWith({
                    apiVersion : '2014-03-28',
                    region     : 'us-east-1'
                });
            });

            it('initializes with options set',function(){
                var o = new cwlog.CWLogFilter({ apiVersion:'foo', region:'us2', blah:'blah'});
                expect(aws.CloudWatchLogs).toHaveBeenCalledWith({
                    apiVersion : '2014-03-28',
                    region     : 'us2',
                    blah       : 'blah'
                });
            });

            it('creates instance vars',function(){
                var o = new cwlog.CWLogFilter();
                expect(o._cwLogs).toBe(mockCloudWatchLogs);
                expect(o._params).toBeNull();
            });
        });

        describe('.open',function(){
            var filter, mockResults;
            beforeEach(function(){
                filter = new cwlog.CWLogFilter();
                spyOn(cwlog.util,'copyFilterParams').and.callThrough();
                mockResults = {
                    events              : [ 
                        { logStreamName : 'stream1', message : 'message1' },
                        { logStreamName : 'stream1', message : 'message2' }
                    ],
                    searchedLogStreams  : [
                        { logStreamName : 'stream1', searchedCompletely : false }
                    ],
                    nextToken           : 'ABC' 
                };
            });

            it('calls filterLogEvents, sets _nextToken, _params',function(done){
                var params = { logGroupName:'toby', logStreamNames : [ 'stream1','stream2' ] };
                mockCloudWatchLogs.filterLogEvents.and.callFake(function(params,cb){
                    return cb(null,mockResults);
                });
                filter.open( params )
                .then(function(res){
                    expect(res).toBe(mockResults);
                    expect(cwlog.util.copyFilterParams).toHaveBeenCalledWith(params);
                    expect(filter._params).toEqual(jasmine.objectContaining({
                        logGroupName    : 'toby',
                        logStreamNames  : [ 'stream1', 'stream2' ],
                        nextToken       : 'ABC'
                    }));
                })
                .then(done,done.fail);
            });

            it('rejects with an error if the aws call fails',function(done){
                var params = { logGroupName : 'toby' },
                    err = new Error('error');
                mockCloudWatchLogs.filterLogEvents.and.callFake(function(params,cb){
                    return cb(err);
                });
                filter.open( params )
                .catch(function(e){
                    expect(filter._params).toBeNull();
                    expect(e).toBe(err);
                })
                .then(done,done.fail);
            });
        });

        describe('.next',function(){
            var filter;
            beforeEach(function(){
                filter = new cwlog.CWLogFilter();
            });

            it('resolves with no params if there are no further records',function(done){
                filter.next()
                .then(function(v){
                    expect(v).not.toBeDefined();
                })
                .then(done,done.fail);
            });

            it('calls filterLogEvents with previous params + nextToken if set',function(done){
                var mockResults = {}, paramVal;
                filter._params = { logGroupName : 'toby', nextToken : 'ABC' };
                mockCloudWatchLogs.filterLogEvents.and.callFake(function(params,cb){
                    paramVal = JSON.parse(JSON.stringify(params));
                    return cb(null,mockResults);
                });
                filter.next()
                .then(function(v){
                    expect(paramVal).toEqual(jasmine.objectContaining({
                            logGroupName: 'toby',
                            nextToken: 'ABC'
                        }));
                    expect(v).toBe(mockResults);
                })
                .then(done,done.fail);
            });

        });
        
        describe('.eof',function(){
            var filter;
            beforeEach(function(){
                filter = new cwlog.CWLogFilter();
            });

            it('returns true if _params is not set',function(){
                expect(filter.eof()).toEqual(true);
            });
            
            it('returns true if _params.nextToken is not set',function(){
                filter._params = {} ;
                expect(filter.eof()).toEqual(true);
            });
            
            it('returns false if _params.nextToken is set',function(){
                filter._params = { nextToken : 'abc' };
                expect(filter.eof()).toEqual(false);
            });
        });
    });
    
    describe('CWLogFilterEventStream',function(){
        describe('initialization',function(){
            beforeEach(function(){
                spyOn(cwlog.util,'copyFilterParams').and.callThrough();
            });

            it('initializes the settings',function(){
                var fakeParams = {  logGroupName: 'toby'},
                    fakeOpts   = {},
                    stream;
                stream = new cwlog.CWLogFilterEventStream(fakeParams, fakeOpts);
                expect(stream._cwOpts).toBe(fakeOpts);
                expect(stream._filterParams).toEqual(jasmine.objectContaining({
                    logGroupName : 'toby'
                }));
                expect(stream._follow).toEqual(false);
                expect(stream._followInterval).toEqual(1000);
                expect(stream._reading).toEqual(false);
                expect(stream._ival).toBeNull();
                expect(stream._closed).toEqual(false);
                expect(stream._readableState).toBeDefined();
                expect(stream._readableState.objectMode).toEqual(true);
            });

            it('handles follow options',function(){
                var fakeParams = {  logGroupName: 'toby', follow : true, followInterval: 100},
                    stream;
                stream = new cwlog.CWLogFilterEventStream(fakeParams );
                expect(stream._filterParams).toEqual(jasmine.objectContaining({
                    logGroupName : 'toby'
                }));
                expect(stream._filterParams.follow).not.toBeDefined();
                expect(stream._filterParams.followInterval).not.toBeDefined();
                expect(stream._follow).toEqual(true);
                expect(stream._followInterval).toEqual(100);

            });

            describe('event handling',function(){
                var stream;
                beforeEach(function(){
                    stream = new cwlog.CWLogFilterEventStream({},{});
                    spyOn(stream,'emit').and.callThrough();
                    spyOn(stream,'_startFollow');
                    spyOn(stream,'_stopFollow');
                });

                it('stops following on pause, when not closed',function(){
                    stream.emit('pause');
                    expect(stream._stopFollow).toHaveBeenCalled();
                });

                it('errors on pause, when closed',function(){
                    stream._closed = true;
                    expect(function(){
                        stream.emit('pause');
                    }).toThrow(new Error('Unable to pause a closed stream.'));
                    expect(stream._stopFollow).not.toHaveBeenCalled();
                });

                it('starts following on resume, when not closed',function(){
                    stream.emit('resume');
                    expect(stream._startFollow).toHaveBeenCalled();
                });

                it('errors on resume, when closed',function(){
                    stream._closed = true;
                    expect(function(){
                        stream.emit('resume');
                    }).toThrow(new Error('Unable to resume a closed stream.'));
                    expect(stream._startFollow).not.toHaveBeenCalled();
                });
            });
        });

        describe('.close',function(){
            it('closes',function(){
                var stream = new cwlog.CWLogFilterEventStream({},{});
                spyOn(stream,'emit');
                spyOn(stream,'_stopFollow');
                spyOn(stream,'push');
                stream.close();
                expect(stream._closed).toEqual(true);
                expect(stream._stopFollow).toHaveBeenCalled();
                expect(stream.push).toHaveBeenCalledWith(null);
                expect(stream.emit).toHaveBeenCalledWith('close');
            });
        });

        describe('._read',function(){
            var stream;
            beforeEach(function(){
                stream = new cwlog.CWLogFilterEventStream({},{});
                spyOn(stream,'emit');
                spyOn(stream,'_startFollow');
            });
            it('starts following when not closed',function(){
                stream._read();
                expect(stream._startFollow).toHaveBeenCalled();
            });

            it('errors when closed',function(){
                stream._closed = true;
                stream._read();
                expect(stream.emit).toHaveBeenCalledWith('error',
                    (new Error('Unable to read a closed stream.')));
                expect(stream._startFollow).not.toHaveBeenCalled();
            });
        });

        describe('._startFollow',function(){
            var stream;
            beforeEach(function(){
                stream = new cwlog.CWLogFilterEventStream({},{});
                spyOn(stream,'_readFilter');
            });

            afterEach(function(){
                if (stream._ival){
                    clearInterval(stream._ival);
                }
            });

            it('calls _readFilter once if not following',function(){
                stream._startFollow();
                jasmine.clock().tick(1000);
                expect(stream._readFilter.calls.count()).toEqual(1);
            });
        
            it('does follow when follow=true + ival=null + closed=false',function(){
                stream._follow = true;
                stream._closed = false;
                stream._ival   = null;
                stream._startFollow();
                jasmine.clock().tick(1000);
                expect(stream._readFilter.calls.count()).toEqual(2);
            });
        
            it('does not follow when follow=true ival!=null + closed=false',function(){
                stream._follow = true;
                stream._closed = false;
                stream._ival   = {};
                stream._startFollow();
                jasmine.clock().tick(1000);
                expect(stream._readFilter.calls.count()).toEqual(1);
            });
        
            it('does not follow when follow=true ival=null + closed=true',function(){
                stream._follow = true;
                stream._closed = true;
                stream._ival   = null;
                stream._startFollow();
                jasmine.clock().tick(1000);
                expect(stream._readFilter.calls.count()).toEqual(1);
            });
        
            it('follow at followInterval when set to override',function(){
                stream._follow = true;
                stream._followInterval = 100;
                stream._closed = false;
                stream._ival   = null;
                stream._startFollow();
                jasmine.clock().tick(1000);
                expect(stream._readFilter.calls.count()).toEqual(11);
            });
        });

        describe('._stopFollow',function(){
            it('stops following', function(){
                var stream = new cwlog.CWLogFilterEventStream({},{});
                stream._ival = {};
                stream._stopFollow();
                expect(stream._ival).toBeNull();
            });
        });

        describe('._readFilter',function(){
            var stream, mockFilter;
            
            function createStream(params) {
                stream = new cwlog.CWLogFilterEventStream(params);
                spyOn(stream,'push').and.returnValue(true);
                spyOn(stream,'emit');
                spyOn(stream,'close');
            }

            beforeEach(function(){
                createStream({ logGroupName : 'toby' })
                mockFilter = {
                    open : jasmine.createSpy('filter.open').and.returnValue(q()),
                    next : jasmine.createSpy('filter.next').and.returnValue(q()),
                    eof  : jasmine.createSpy('filter.eof').and.returnValue(true)
                };
                spyOn(cwlog.util,'createCWLogFilter').and.returnValue(mockFilter);
            });

            it('returns immediately if already reading.',function(done){
                stream._reading = true;
                stream._readFilter()
                .then(function(){
                    expect(cwlog.util.createCWLogFilter).not.toHaveBeenCalled();
                })
                .then(done,done.fail);
            });

            it('will close if gets no data and not using follow',function(done){
                var readingValueWas;
                mockFilter.open.and.callFake(function(){
                    readingValueWas = stream._reading;
                    return q();
                });
                stream._readFilter()
                .then(function(){
                    expect(cwlog.util.createCWLogFilter).toHaveBeenCalled();
                    expect(mockFilter.open).toHaveBeenCalledWith({
                        logGroupName : 'toby'
                    });
                    expect(mockFilter.next).not.toHaveBeenCalled();
                    expect(readingValueWas).toEqual(true);
                    expect(stream._reading).toEqual(false);
                    expect(stream._filterParams.startTime).not.toBeDefined();
                    expect(stream.close).toHaveBeenCalled();
                })
                .then(done,done.fail);
            });

            it('will not close if gets no data and using follow',function(done){
                stream._follow = true;
                stream._readFilter()
                .then(function(){
                    expect(stream.close).not.toHaveBeenCalled();
                })
                .then(done,done.fail);
            });

            it('will emit an error if filter open errors',function(done){
                mockFilter.open.and.callFake(function(){
                    return q.reject(new Error('I had an error.'));
                });
                stream._readFilter()
                .then(function(){
                    expect(stream.emit).toHaveBeenCalledWith('error',
                        new Error('I had an error.'));
                    expect(stream._reading).toEqual(false);
                })
                .then(done,done.fail);
            });

            it('will push events, and close if not following',function(done){
                var mockResults = {
                    events : [
                        { message : 'message1', timestamp: 3 },
                        { message : 'message2', timestamp: 1 },
                        { message : 'message3', timestamp: 2 }
                    ]
                };
                mockFilter.open.and.callFake(function(){
                    return q(mockResults);
                });
                stream._readFilter()
                .then(function(){
                    expect(stream.push.calls.count()).toEqual(3); 
                    expect(stream.push.calls.allArgs()).toEqual([
                        [{ message : 'message1', timestamp: 3 }],
                        [{ message : 'message2', timestamp: 1 }],
                        [{ message : 'message3', timestamp: 2 }]
                    ]);
                    expect(stream.close).toHaveBeenCalled();
                    expect(mockFilter.next).not.toHaveBeenCalled();
                    expect(stream._filterParams.startTime).not.toBeDefined();
                })
                .then(done,done.fail);
            });

            it('will push events, iterate and close if not following',function(done){
                mockFilter.eof.and.returnValue(false);
                mockFilter.open.and.callFake(function(){
                    return q({ events : [{ message : 'message1', timestamp: 3 }] });
                });
                mockFilter.next.and.callFake(function(){
                    if (mockFilter.next.calls.count() === 1) {
                        return q({ events : [{ message : 'message2', timestamp: 1 }] });
                    } else {
                        mockFilter.eof.and.returnValue(true);
                        return q({ events : [{ message : 'message3', timestamp: 2 }] });
                    }
                });
                stream._readFilter()
                .then(function(){
                    expect(stream.push.calls.count()).toEqual(3); 
                    expect(stream.push.calls.allArgs()).toEqual([
                        [{ message : 'message1', timestamp: 3 }],
                        [{ message : 'message2', timestamp: 1 }],
                        [{ message : 'message3', timestamp: 2 }]
                    ]);
                    expect(stream.close).toHaveBeenCalled();
                    expect(mockFilter.next.calls.count()).toEqual(2);
                    expect(stream._filterParams.startTime).not.toBeDefined();
                })
                .then(done,done.fail);
            });

            it('will push events, iterate and not close if following',function(done){
                stream._follow = true;
                mockFilter.eof.and.returnValue(false);
                mockFilter.open.and.callFake(function(){
                    return q({ events : [{ message : 'message1', timestamp: 3 }] });
                });
                mockFilter.next.and.callFake(function(){
                    if (mockFilter.next.calls.count() === 1) {
                        return q({ events : [{ message : 'message2', timestamp: 1 }] });
                    } else {
                        mockFilter.eof.and.returnValue(true);
                        return q({ events : [{ message : 'message3', timestamp: 2 }] });
                    }
                });
                stream._readFilter()
                .then(function(){
                    expect(stream.push.calls.count()).toEqual(3); 
                    expect(stream.push.calls.allArgs()).toEqual([
                        [{ message : 'message1', timestamp: 3 }],
                        [{ message : 'message2', timestamp: 1 }],
                        [{ message : 'message3', timestamp: 2 }]
                    ]);
                    expect(stream.close).not.toHaveBeenCalled();
                    expect(mockFilter.next.calls.count()).toEqual(2);
                    expect(stream._filterParams.startTime).toEqual(4);
                })
                .then(done,done.fail);
            });
        });
    });
    
    describe('CWLogEventToMessage',function(){
        var e2m, doneFunc;
        beforeEach(function(){
            e2m = new cwlog.CWLogEventToMessage();
            spyOn(e2m,'push');
            doneFunc = jasmine.createSpy('doneFunc');
        });

        describe('._transform',function(){
            it('will push nothing if the chunk has no message',function(){
                e2m._transform({},null,doneFunc);
                expect(e2m.push).not.toHaveBeenCalled();
            });

            it('will push nothing if the chunk has no timestamp',function(){
                e2m._transform({},null,doneFunc);
                expect(e2m.push).not.toHaveBeenCalled();
            });

            it('will prepend timestamp to the message if it does not have one',function(){
                e2m._transform({message:'A\tmessage.\n',timestamp:67910400000}, null, doneFunc);
                expect(e2m.push).toHaveBeenCalledWith('1972-02-26T00:00:00.000Z A\tmessage.\n');
            });

            it('will not prepend timestamp to the message if it already has one',function(){
                e2m._transform({message:'2015-05-01 A\tmessage.\n',timestamp:67910400000},
                    null, doneFunc);
                expect(e2m.push).toHaveBeenCalledWith('2015-05-01 A\tmessage.\n');
            });

            it('will flatten tabs if crunchTabs option is set.',function(){
                e2m = new cwlog.CWLogEventToMessage( { crunchTabs : true });
                spyOn(e2m,'push');
                e2m._transform({message:'2015-05-01 A\tmessage.\n',timestamp:67910400000},
                    null, doneFunc);
                expect(e2m.push).toHaveBeenCalledWith('2015-05-01 A message.\n');
            });
            
            it('will not append endline to message if its not there.',function(){
                e2m._transform({message:'2015-05-01 A\tmessage.',timestamp:67910400000},
                    null, doneFunc);
                expect(e2m.push).toHaveBeenCalledWith('2015-05-01 A\tmessage.\n');
            });
            
            it('will append endline with crunchTabs option set.',function(){
                e2m = new cwlog.CWLogEventToMessage( { crunchTabs : true });
                spyOn(e2m,'push');
                e2m._transform({message:'2015-05-01 A\tmessage.',timestamp:67910400000},
                    null, doneFunc);
                expect(e2m.push).toHaveBeenCalledWith('2015-05-01 A message.\n');
            });

        });
    });
});

