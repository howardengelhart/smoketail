var aws         = require('aws-sdk'),
    util        = require('util'),
    Readable    = require('stream').Readable,
    Transform   = require('stream').Transform,
    q           = require('q'),
    isArray     = util.isArray,
    lib         = {};

/**
 * CWLogFilter
 * A simple cursor type wrapper for the aws CloudWatchLogs filterLogEvents method.
 * 
 * @class CWLogFilter
 * @constructor
 * @param {Object} [opts={apiVersion:'2014-03-28',region:'us-east-1'} ] Configuration options
 *      for the instance. This will be passed to the AWS.CloudWatchLogs constructor.  
 *      See [AWS Javascript SDK documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/
 *      latest/AWS/CloudWatchLogs.html#constructor-property) for full description of
 *      available settings.
 */

function CWLogFilter(opts){
    opts = opts || { };
    opts.apiVersion  = '2014-03-28';
    opts.region      = opts.region || 'us-east-1';

    if (opts.profile) {
      aws.config.credentials = new aws.SharedIniFileCredentials(opts);
    }

    this._cwLogs    = new aws.CloudWatchLogs(opts);
    this._params    = null;
}

/**
 * Make initial call to filterLogEvents.
 *
 * @method open
 * @param {Object} params The parameters to pass to the filterLogEvents call.  See 
 *      [AWS Documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/
 *      CloudWatchLogs.html#filterLogEvents-property) for all supported options.
 * @return {Promise} A promise that will be resolved with the result of filterLogEvents.
 */
CWLogFilter.prototype.open = function(params) {
    var self = this, myParams = null;
    self._params = null;
    myParams = lib.copyFilterParams(params);
    
    return q.ninvoke(this._cwLogs,'filterLogEvents',myParams)
        .then(function(res){
            self._params = myParams;
            self._params.nextToken = res.nextToken;
            return res;
        });
};

/**
 * Calls to next will re-call the aws api, using the params passed to the open method, 
 * along with the nextToken received on the previous aws response.
 *
 * @method next
 * @return {Promise} A promise that will be resolved with the result of filterLogEvents.
 */
CWLogFilter.prototype.next = function(){
    var self = this;
    
    if ((!this._params) || (!this._params.nextToken)) {
        return q();
    }
    
    return q.ninvoke(this._cwLogs,'filterLogEvents',this._params)
        .then(function(res){
            if (res.nextToken) {
                self._params.nextToken = res.nextToken;
            } else {
                delete self._params.nextToken;
            }
            return res;
        });
};

/**
 * Detect whether there are subsequent records left on the filter.
 *
 * @method eof
 * @return {boolean} True if there are no more records (last aws response contained no nextToken).
 */
CWLogFilter.prototype.eof = function(){
    return ((!this._params) || (!this._params.nextToken));

};

/**
 * CWLogFilterEventStream
 * Implements a readable stream for getting CloudWatch Log Events via the filterLogEvents
 * API.  All standard Readable Streaming methods and events should be supported, however
 * the data returned are unencoded Event objects returned by the AWS api.
 * 
 * @class CWLogFilterEventStream
 * @constructor
 * @param {Object} params Parameters that will be passed to AWS filterLogEvents API call, with
 *      an additional supported option, "follow".  If follow is set to true, the stream
 *      will remain open and make periodic calls (default is 1 second intervals) to re-using
 *      the initial filter Parameters to check for additional log data, using the max last
 *      received event time + 1 as the start time. To override default inteval, use
 *      "followInterval" with your desired interval (in milliseconds).  See [AWS Documentation]
 *      (http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#
 *      filterLogEvents-property) for all supported options.
 * @param {Object} [opts={apiVersion:'2014-03-28',region:'us-east-1'} ] AWS config options
 *      for the instance. This will be passed to the AWS.CloudWatchLogs constructor.  
 *      See [AWS Javascript SDK documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/
 *      latest/AWS/CloudWatchLogs.html#constructor-property) for full description of
 *      available settings.
 */

function CWLogFilterEventStream(filterParams, cwOpts) {
    Readable.call(this, { highWaterMark: 102400, objectMode : true });
    this._cwOpts             = cwOpts;    
    this._filterParams       = lib.copyFilterParams(filterParams);
    this._follow             = !!filterParams.follow;
    this._followInterval     = filterParams.followInterval || 1000;
    this._reading            = false;
    this._ival               = null;
    this._closed             = false;
    var self = this;

    this.on('pause',function(){
        if (self._closed) {
            self.emit('error',new Error('Unable to pause a closed stream.'));
        } else {
            self._stopFollow();
        }
    });
    
    this.on('resume',function(){
        if (self._closed) {
            self.emit('error',new Error('Unable to resume a closed stream.'));
        } else {
            self._startFollow();
        }
    });
}

util.inherits(CWLogFilterEventStream, Readable);

/**
 * Stops checks for further logs and invalidates the stream. Will emit a 'close' event,
 * and 'end' event. After close has been called, the stream is invalid and cannot be
 * re-used.
 *
 * @method close
 */
CWLogFilterEventStream.prototype.close = function(){
    this._closed = true;
    this._stopFollow();
    this.push(null);
    this.emit('close');
};

/* Stream API */
CWLogFilterEventStream.prototype._read = function(){
    if (this._closed) {
        this.emit('error',new Error('Unable to read a closed stream.'));
    } else {
        this._startFollow();
    }
};

CWLogFilterEventStream.prototype._startFollow = function(){
    var self = this;
    if ((self._follow) && (!self._ival) && (!self._closed)) {
        self._ival = setInterval(function(){
            self._readFilter();
        },self._followInterval);
    }
    this._readFilter();
};

CWLogFilterEventStream.prototype._stopFollow = function(){
    if (this._ival) {
        clearInterval(this._ival);
        this._ival = null;
    }
};

CWLogFilterEventStream.prototype._readFilter = function() {
    if (this._reading) {
        return q();
    }

    var self = this, filter = lib.createCWLogFilter(this._cwOpts), lastTimestamp = 0;

    function iterateFilter(res){
        var idx, eventCount, data;
        if (!res || !res.events) { 
            return filter;
        }
        eventCount = res.events.length;
        for (idx = 0; idx < eventCount; idx++) {
            data = res.events[idx];
            lastTimestamp = Math.max(lastTimestamp,data.timestamp);
            if (!self.push(data)){
                return filter; 
            }
        }

        if (filter.eof()){
            return filter;
        }

        return filter.next().then(iterateFilter);
    }

    this._reading = true;
    return filter.open(this._filterParams)
    .then(iterateFilter)
    .then(function(){
        if (!self._follow) {
            self.close();
        } else {
            if (lastTimestamp > (self._filterParams.startTime || 0 )) {
                self._filterParams.startTime = lastTimestamp + 1;
            }
        }
        
        self._reading = false;
    })
    .catch(function(err){
        self.emit('error',err);
        self._reading = false;
    });
};

/**
 * CWLogEventToMessage
 * Transforms CWFilterEventStream log event objects into strings.
 * 
 * @class CWLogEventToMessage
 * @constructor
 * @param {Object} opts Options for how to format the results.
 *      opts.crunchTabs - If true, will convert tabs to spaces.
 */
function CWLogEventToMessage(opts){
    if (opts && opts.crunchTabs) {
       this._crunchTabs = true;  
    }
    Transform.call(this, { objectMode : true });
}

util.inherits(CWLogEventToMessage, Transform);

CWLogEventToMessage.prototype._transform = function(chunk, encoding, done) {
    if ((chunk.message === undefined) || (chunk.timestamp === undefined)){
        return done();
    }

    var message = chunk.message;
    if (this._crunchTabs) {
        message = chunk.message.replace(/\t/,' '); 
    }

    if (message.charAt(message.length - 1) !== '\n') {
        message += '\n';
    }

    if (message.match(/^\d\d\d\d-\d\d-\d\d\D/)){
        this.push(message);
    } else {
        this.push((new Date(chunk.timestamp)).toISOString() + ' ' + message);
    }
    done();
};

/******************************
 * Utils 
 */

/**
 * Makes a copy of filterLogEvent parameters, omitting cruft
 */
lib.copyFilterParams = function(params){
    var myParams = null;
    [   'logGroupName','logStreamNames','startTime','endTime','filterPattern',
        'nextToken','limit','interleaved' ].forEach(function(prop){
        if (params[prop]) {
            myParams = myParams || {};
            if (isArray(params[prop])){
                myParams[prop] = params[prop].concat(); 
            } else {
                myParams[prop] = params[prop];
            }
        }
    });
    return myParams;
};

/**
 * Mainly used to make it easier to mock a filter for testing the filter stream
 */
lib.createCWLogFilter = function(opts) {
    return new CWLogFilter(opts);
};


/******************************
 * Exports 
 */
module.exports.util                      = lib;
module.exports.CWLogFilter               = CWLogFilter;
module.exports.CWLogFilterEventStream    = CWLogFilterEventStream;
module.exports.CWLogEventToMessage       = CWLogEventToMessage;
module.exports.logEventToMessage         = new CWLogEventToMessage();

