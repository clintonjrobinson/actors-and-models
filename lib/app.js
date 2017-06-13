"use strict";

/** Koa libs */
var koa = require('koa');
var responseTime = require('koa-response-time');
var logger = require('koa-logger');
var session = require('koa-session-redis');
var compress = require('koa-compress');
var bodyParser = require('koa-better-body');
var error = require('koa-error');
var forceSSL = require('koa-force-ssl');

exports = module.exports = function(Models, routes) {
  var app = new koa();

  //If SSL is enabled, we will force the use of it.
  if (Models.config.ssl && Models.config.ssl.force) {
    app.use(forceSSL());
  }

  //Hook-up response time first.
  app.use(responseTime());

  //Error reporting
  app.use(error());

  //Then logging.
  app.use(logger());
  
  //Body Parser
  app.use(bodyParser());
  
  //Sessions
  app.keys = [Models.config.session.secret];
  
  Models.api.session = session({store: {
    host: Models.config.redis.host,
    port: Models.config.redis.port,
    ttl: Models.config.session.timeout
  }});

  //Compress
  app.use(compress({
    threshold: 2048,
    flush: require('zlib').Z_SYNC_FLUSH
  }));

  //Setup any additional routes
  if (routes) routes.forEach(function(fn) {app.use(fn)});

  app.Models = Models;

  return app;
};

/**
 var Cookies = require('cookies');
 var redis = require('redis');

 //redis client for session
 var client = redis.createClient(app.config.redis);
 var server = require('http').createServer(app.callback());
 exports.server = module.exports.server = server;

 var wss = new (require('ws').Server)({
  server: server,
  verifyClient: function(info, cb) {
    var cookies = new Cookies(info.req, null, app.keys);
    var sid = cookies.get('koa:sess', {});
    client.get(sid, function(err, ting) {
      if (err) {
        return cb(false);
      }

      cb(true);
    });
  }
});

 wss.on('connection', function connection(ws) {
  console.log(ws.headers);

  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ws.send('something');
});
 */