"use strict";

var path = require('path');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var Mongo = require('promises-of-mongo');

if (!Object.assign) {
  Object.assign = require('object-assign');
}

function Models(config) {
  //Load the config file from the project directory
  Models.config = config['global'] || {};
  Object.assign(Models.config, config['env:' + Models.constants.APP_ENV] || {});

  //Set the root path.  This will come in handy later for lots of functions.
  Models.config.root = config.root || __dirname;

  ///Koa routes
  Models.auth = require('./lib/auth')(Models);

  //Create the koa app
  Models.api = {};
  Models.app = require('./lib/app')(Models);

  //Setup Client side JS
  Models.clientJS = require('./lib/client')(Models);

  require('./lib/api')(Models);

  Models.connections = {};
  for (let connection in Models.config.mongos) {
    Models.connections[connection] = new Mongo(Models.config.mongos[connection]);
  }

  Models.mongo = Models.connections.default;

  //Ensure that all the required users have been created.
  require('./lib/requiredUsers')(Models);

  return Models;
}

exports = module.exports = Models;

Models.constants = require('./lib/constants');
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

Models.listen = function() {
  /**
   * Only fork in the production environemnt.
   */
  if (cluster.isMaster && Models.config.cluster) {
    // Fork workers.
    console.log(`${Models.config.name} - master thread NODE_ENV:${Models.constants.NODE_ENV} APP_ENV:${Models.constants.APP_ENV}`);
    for (var i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit',
      function (worker, code, signal) {
        console.error('error: ' + new Date() + ' Worker ' + worker.pid + ' died');
        cluster.fork();
      }
    );
  } else {
    Models.app.listen(Models.config.port);
    console.log(`${Models.config.name}-${process.pid} listening on ${Models.config.domain}:${Models.config.port} NODE_ENV:${Models.constants.NODE_ENV} APP_ENV:${Models.constants.APP_ENV}`);
  }
};