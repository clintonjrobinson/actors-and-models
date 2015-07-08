"use strict";

/** Koa libs */
var koa = require('koa');
var responseTime = require('koa-response-time');
var logger = require('koa-logger');
var session = require('koa-session-redis');
var compress = require('koa-compress');
var bodyParser = require('koa-better-body');
var error = require('koa-error');

exports = module.exports = function(Models) {
  var app = koa();

  //Hook-up response time first.
  app.use(responseTime());

  //Error reporting
  app.use(error());

  //Then logging.
  app.use(logger());

  //Sessions
  app.keys = [Models.config.session.secret];

  Models.api.session = session({store: {
    host: Models.config.redis.host,
    port: Models.config.redis.port,
    ttl: Models.config.session.timeout
  }});

  //Body Parser
  app.use(bodyParser({multipart:true}));

  //Compress
  app.use(compress({
    threshold: 2048,
    flush: require('zlib').Z_SYNC_FLUSH
  }));

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