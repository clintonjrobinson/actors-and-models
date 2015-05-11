"use strict";

var path = require('path');

if (!Object.assign) {
  Object.assign = require('object-assign');
}

function Models(config) {
  //Load the config file from the project directory
  Models.config = config['global'] || {};
  Object.assign(Models.config, config['env:' + Models.constants.APP_ENV] || {});

  //Set the root path.  This will come in handy later for lots of functions.
  Models.config.root = path.resolve(__dirname, '../');

  ///Koa routes
  Models.auth = require('./lib/auth');

  //Create the koa app
  Models.app = require('./lib/app')(Models);

  //Setup Client side JS
  Models.clientJS = require('./lib/client')(Models);

  Models.api = require('./lib/api')(Models);

  return Models;
}

exports = module.exports = Models;

Models.constants = require('./lib/constants');
Models.utils = require('./lib/utils');
Models.errors = require('./lib/errors');

//TODO: Probably a better way to do this.
Models.setMongoConnection = function(mongo) {
  Models.mongo = mongo;
  Models.Document.setMongoConnection(mongo);

  //Ensure that all the required users have been created.
  require('./lib/requiredUsers')(Models);
};

Models.Types = require('./lib/types');
Models.Validators = require('./lib/validators');
Models.Property = require('./lib/models/Property');
Models.Common = require('./lib/models/Common');

Models.Structure = require('./lib/models/Structure');
Models.structure = Models.Structure.registerDefinition;
Models.structures = Models.Structure.structures;

Models.Document = require('./lib/models/Document');
Models.model = Models.Document.registerDefinition;
Models.models = Models.Document.models;

Models.Projection = require('./lib/models/Projection');
Models.projection = Models.Projection.registerDefinition;
Models.projections = Models.Projection.projections;

//Create the User model, it is the only one we will define cuz its important.
require('./models/User')(Models);