'use strict';

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

  Models.api.session = session({
    store: {
      host: Models.config.redis.host,
      port: Models.config.redis.port,
      ttl: Models.config.session.timeout
    }
  });

  //Compress
  app.use(
    compress({
      threshold: 2048,
      flush: require('zlib').Z_SYNC_FLUSH
    })
  );

  app.use(function*() {
    this.Models = Models;
  });

  //Setup any additional routes
  if (routes)
    routes.forEach(function(fn) {
      app.use(fn);
    });

  app.Models = Models;

  return app;
};