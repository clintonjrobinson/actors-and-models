"use strict";

var path = require('path');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var Mongo = require('promises-of-mongo');
var fs = require('fs');
var http = require('http');
var https = require('https');
var merge = require('merge-deep');
var events = require('events');

function Models(config, routes) {
  Models.constants = require('./lib/constants');
  Models.emitter = new events.EventEmitter();

  //Load the config file from the project directory
  Models.config = config['global'] || {};
  Models.config = merge(Models.config, config['env:' + Models.constants.APP_ENV] || {});

  //Set the root path.  This will come in handy later for lots of functions.
  Models.config.root = config.root || __dirname;

  if (!config.noServer && cluster.isMaster && Models.config.cluster) {
    // Fork workers.
    console.log(`${Models.constants.APP_ENV} - master thread NODE_ENV:${Models.constants.NODE_ENV} APP_ENV:${Models.constants.APP_ENV}`);
    for (var i = 0; i < numCPUs; i++) {
      setTimeout(function() {
        cluster.fork();
      }, i*2000);
    }

    cluster.on('exit',
      function (worker, code, signal) {
        console.error('error: ' + new Date() + ' Worker ' + worker.pid + ' died');
        cluster.fork();
      }
    );

    return Models;
  }

  Models.utils = require('./lib/utils');
  Models.errors = require('./lib/errors');

  Models.Types = require('./lib/types');
  Models.Validators = require('./lib/validators');
  Models.Property = require('./lib/models/Property');
  Models.Common = require('./lib/models/Common');

  Models.Structure = require('./lib/models/Structure');
  Models.structure = Models.Structure.registerDefinition;
  Models.structures = Models.Structure.structures;

  Models.Document = require('./lib/models/Document')(Models);
  Models.model = Models.Document.registerDefinition;
  Models.models = Models.Document.models;

  Models.Projection = require('./lib/models/Projection');
  Models.projection = Models.Projection.registerDefinition;
  Models.projections = Models.Projection.projections;

  //Create the User model, it is the only one we will define cuz its important.
  require('./models/User')(Models);


  Models.connections = {};

  for (let connection in Models.config.mongos) {
    Models.connections[connection] = new Mongo(Models.config.mongos[connection]);
  }

  Models.mongo = Models.connections.default;

  if (!config.noServer) {
    //Create the koa app
    Models.api = {};
    Models.app = require('./lib/app')(Models, routes);

    ///Koa routes
    Models.auth = require('./lib/auth')(Models);
    require('./lib/api')(Models);

    //Ensure that all the required users have been created.
  }

  require('./lib/requiredUsers')(Models);

  return Models;
}

Models.listen = function() {
  if (!(cluster.isMaster && Models.config.cluster)) {
    if (Models.config.ssl) {
      var options = {
        key: fs.readFileSync(Models.config.ssl.key),
        cert: fs.readFileSync(Models.config.ssl.cert),
        passphrase: Models.config.ssl.passphrase
      };

      if (Models.config.ssl.ca) {
        if (!Array.isArray(Models.config.ssl.ca)) Models.config.ssl.ca = [Models.config.ssl.ca];
        options.ca = Models.config.ssl.ca.map(function(file){return fs.readFileSync(file)});
      }

      https.createServer(options, Models.app.callback()).listen(Models.config.ssl.port);

      console.log(`${Models.constants.APP_ENV}-${process.pid} listening with SSL on ${Models.config.domain}:${Models.config.ssl.port} NODE_ENV:${Models.constants.NODE_ENV} APP_ENV:${Models.constants.APP_ENV}`);
    }
    // start the server

    http.createServer(Models.app.callback()).listen(Models.config.port);
    console.log(`${Models.constants.APP_ENV}-${process.pid} listening on ${Models.config.domain}:${Models.config.port} NODE_ENV:${Models.constants.NODE_ENV} APP_ENV:${Models.constants.APP_ENV}`);
  }
};

exports = module.exports = Models;
