var defaults = require('./defaults.js');
var util = require('util');
var http = require('http');
var https = require('https');

// callback(err, protocol)
module.exports.Protocol = promisesWrapper(function (options, callback) {
    // attempt to fetch the protocol directly from the Chromium repository
    // according to the current version; fallback to the hardcoded version
    //
    // Thanks to Paul Irish.
    // (see https://github.com/cyrus-and/chrome-remote-interface/issues/10#issuecomment-146032907)
    var fallbackProtocol = require('./protocol.json');
    var protocol = {'fromChrome': false, 'descriptor': fallbackProtocol};
    module.exports.Version(options, function (err, info) {
        if (err) {
            callback(null, protocol);
        } else {
            var version = info['WebKit-Version'];
            var match = version.match(/\s\(@(\b[0-9a-f]{5,40}\b)/);
            var hash = match[1];
            var fromChromiumDotOrg = (hash <= 202666);
            var template = (fromChromiumDotOrg ?
                'https://src.chromium.org/blink/trunk/Source/devtools/protocol.json?p=%s':
                'https://chromium.googlesource.com/chromium/src/+/%s/third_party/WebKit/Source/devtools/protocol.json?format=TEXT');
            var url = util.format(template, hash);
            fetchObject(https, url, function (err, data) {
                if (!err) {
                    try {
                        // the file is served base64 encoded from googlesource.com
                        if (!fromChromiumDotOrg) {
                            data = new Buffer(data, 'base64').toString();
                        }
                        protocol.fromChrome = true;
                        protocol.descriptor = JSON.parse(data);
                    } catch (_) {
                        // fall back
                    }
                }
                callback(null, protocol);
            });
        }
    });
});

module.exports.List = promisesWrapper(function (options, callback) {
    options.path = '/json/list';
    devToolsInterface(options, function (error, tabs) {
        if (error) {
            callback(error);
        } else {
            callback(null, JSON.parse(tabs));
        }
    });
});

module.exports.New = promisesWrapper(function (options, callback) {
    options.path = '/json/new';
    if (Object.prototype.hasOwnProperty.call(options, 'url')) {
        options.path += '?' + options.url;
    }
    devToolsInterface(options, function (error, tab) {
        if (error) {
            callback(error);
        } else {
            callback(null, JSON.parse(tab));
        }
    });
});

module.exports.Activate = promisesWrapper(function (options, callback) {
    options.path = '/json/activate/' + options.id;
    devToolsInterface(options, function (error) {
        if (error) {
            callback(error);
        } else {
            callback(null);
        }
    });
});

module.exports.Close = promisesWrapper(function (options, callback) {
    options.path = '/json/close/' + options.id;
    devToolsInterface(options, function (error) {
        if (error) {
            callback(error);
        } else {
            callback(null);
        }
    });
});

module.exports.Version = promisesWrapper(function (options, callback) {
    options.path = '/json/version';
    devToolsInterface(options, function (error, versionInfo) {
        if (error) {
            callback(error);
        } else {
            callback(null, JSON.parse(versionInfo));
        }
    });
});

// options.path must be specified; callback(err, data)
function devToolsInterface(options, callback) {
    options.host = options.host || defaults.HOST;
    options.port = options.port || defaults.PORT;
    fetchObject(http, options, callback);
}

// wrapper that allows to return a promise if the callback is omitted, it works
// for DevTools methods
function promisesWrapper(func) {
    return function (options, callback) {
        // options is an optional argument
        if (typeof options === 'function') {
            callback = options;
            options = undefined;
        }
        options = options || {};
        // just call the function otherwise wrap a promise around its execution
        if (callback) {
            func(options, callback);
        } else {
            return new Promise(function (fulfill, reject) {
                func(options, function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        fulfill(result);
                    }
                });
            });
        }
    };
}

// callback(err, data)
function fetchObject(transport, options, callback) {
    var request = transport.get(options, function (response) {
        var data = '';
        response.on('data', function (chunk) {
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                callback(null, data);
            } else {
                callback(new Error(data));
            }
        });
    });
    request.on('error', function (err) {
        callback(err);
    });
}