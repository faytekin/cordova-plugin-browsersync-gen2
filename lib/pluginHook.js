var path = require('path');

var Patcher = require('./utils/Patcher');
var browserSyncServer = require('./utils/browserSyncServer');

function parseOptions(opts)
{
    var result = {};
    opts = opts || [];
    opts.forEach(function(opt) {
        var parts = opt.split(/=/);
        result[parts[0].replace(/^-+/, '')] = parts[1] || true;
    });
    return result;
}

module.exports = function(context)
{
    var Q = require('q');
    var deferral = new Q.defer();

    var options = context.hook === "before_serve" ? parseOptions(process.argv.slice(3)) : context.opts.options;
	if (typeof options['live-reload'] === 'undefined')
    {
        return;
    }

    options['index'] = typeof options['index'] !== 'undefined' ? options['index'] : 'index.html';

    var enableCors = typeof options['enable-cors'] !== 'undefined';

    var ignoreOptions = {};
    if (typeof options['ignore'] !== 'undefined')
    {
        ignoreOptions = {ignored: options['ignore']};
    }

    // TODO - Enable live reload servers

    var platforms = ['android', 'ios', 'browser'];
    var patcher = new Patcher(context.opts.projectRoot, platforms);
    patcher.prepatch();
    var changesBuffer = [];
    var changesTimeout;
    var serversFromCallback=[];
    var bs = browserSyncServer(function(defaults)
    {
        if (enableCors)
        {
            defaults.middleware = function (req, res, next)
            {
              res.setHeader('Access-Control-Allow-Origin', '*');
              next();
            };
        }
        defaults.files.push(
        {
            match: ['www/**/*.*'],
            fn: function(event, file) {
                if (event === 'change') {
                    changesBuffer.push(file);
                    if(changesTimeout){
                      clearTimeout(changesTimeout);
                    }
                    changesTimeout = setTimeout(function(){
                      context.cordova.prepare().then(function() {
                          patcher.addCSP({
                              index: options.index,
                              servers: serversFromCallback, //need this for building proper CSP
                          });
                          console.info(changesBuffer);
                          bs.reload(changesBuffer);
                          changesBuffer = [];
                      });
                    },200);
                }
            },
            options: ignoreOptions
        });

        defaults.server = 
        {
            baseDir: context.opts.projectRoot,
            routes: {}
        };

        platforms.forEach(function(platform)
        {
            var www = patcher.getWWWFolder(platform);
            switch (platform)
           	{
           		case "browser":
           			defaults.server.routes["/"] = path.join(context.opts.projectRoot, www);
           			break;
           		default:
           			defaults.server.routes['/' + www.replace('\\','/')] = path.join(context.opts.projectRoot, www);
           			break;
           	}
        });

        // Merge user parameters with defaults
        for (var opt in options)
        {
        	defaults[opt] = options[opt];
        }

        return defaults;
    },
    function(err, servers)
    {
        serversFromCallback=servers;
        patcher.patch(
        {
            servers: servers,
            index: options.index
        });

        // This will prevent cordova static page server from running
        if (context.hook !== "before_serve")
        {
        	deferral.resolve();
        }
    });

    return deferral.promise;
};
