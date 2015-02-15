"use strict";

var ObjectID = require('mongodb').ObjectID;
var co = require('co');

var Document = require('./lib/Document');
var Structure = require('./lib/Structure');
var Types = require('./lib/Types');
var utils = require('./lib/utils');

var userDefinition = require('./models/User').User;
var mongo;

exports = module.exports = Models;

function Models(model) {
  return Document.models[model];
}

//TODO: Probably a better way to do this.
//Probably model should be a part of our Mongo lib, refactor this later.
Models.setMongoConnection = function(_mongo) {
  mongo = _mongo;
  Document.setMongoConnection(mongo);

  //Make sure the appropriate users have been set.
  co(function *() {
    yield ensureSystemUser;
    yield ensureAnonymousUser;
    yield ensureAdministratorUser;
  }).catch(function (e) {
    console.error(e);
    console.error(e.data);
    console.error(e.stack);
  });
};

function *ensureSystemUser() {
  var User = Document.models.User;

  Models.systemUser = yield mongo.findOne(User.collectionName, {login:'system'});

  //No System user found.  Create one.
  if (!Models.systemUser) {
    let user = {
      login: 'system',
      name: 'System',
      password: utils.guid(32),
      roles: ['System']
    };

    console.log('- Actors & Models - no system user found.  Creating one.');
    let systemUser = yield mongo.insert(User.collectionName, user);
    Models.systemUser = new User(systemUser);
  }

  global.systemContext = {
    session: {user: Models.systemUser},
    user: Models.systemUser,
    userId: Models.systemUser._id,
    roles: ['System'],
    isSystemContext: true
  };
}

function *ensureAnonymousUser() {
  var User = Document.models['User'];

  try {
    Models.anonymousUser = yield User.get(global.systemContext, {login:'anonymous'});
  } catch (e) {
    console.log('- Actors & Models - no anonymous user found.  Creating one.');
    Models.anonymousUser = yield User.create(
      global.systemContext,
      new User({
        login: 'anonymous',
        name: 'Anonymous',
        password: utils.guid(32),
        roles: ['Anonymous']
      }),
      {overrideValidation: true}
    );
  }

  global.anonymousContext = {session:{user:Models.anonymousUser}};
}

function *ensureAdministratorUser() {
  var User = Document.models['User'];

  try {
    let administrator = yield User.get(global.systemContext, {login:'admin'});
  } catch (e) {
    let password = utils.guid(32);

    console.log('- Actors & Models - no administrator user found.  Creating one with password: ' + password);
    yield User.create(global.systemContext, {
      login: 'admin',
      name: 'System Administrator',
      password: password,
      roles: ['Admin']
    });
  }

}

//TODO: Implement.  Allow new validation functions to be registered
Models.registerValidator = function() {

};

Models.api = function() {
  return function *(next) {
    function enforcePost() {
      if (this.method !== 'POST') {
        throw new Error(`API call must be POST, you sent ${this.method}`);
      }
    }

    //First get setup some user helpers in the context
    this.user = (this.session && this.session.user) ? this.session.user : null;
    this.userId = this.user ? this.user._id : null;
    this.roles = (this.user && this.user.roles) ? this.user.roles : ['Anonymous'];

    if (/\/api\/v1\//.test(this.path)) {
      var call = this.path.replace('/api/v1/', '').split('/');
      var model = Document.models[call[0]];

      switch (call[1]) {
        case 'count':
          this.body = yield model.count(this, this.request.body);
          break;

        case 'find':
          this.body = yield model.find(this, this.request.body);
          break;

        case 'create':
          enforcePost.call(this);
          var obj = yield model.create(this, this.request.body);
          this.body = model.secureByAction(this, obj, 'read');
          break;

        default: {
          let id = call[1];
          let action = call[2];

          if (!id) {
            throw new Error('No ID provided');
          }

          try {
            id = new ObjectID(id);
          } catch(e) {
            throw new Error('Invalid ID supplied : ' + id);
          }

          switch (action) {
            case 'get':
              this.body = yield model.get(this, id);
              break;

            case 'remove':
              this.body = yield model.remove(this, id);
              break;

            case 'update':
              enforcePost.call(this);
              this.body = yield model.update(this, id, this.request.body);
              break;

            default:
              throw new Error('Unrecognized command: ' + action);
          }
        }
      }
    }

    yield next;
  }
};

Models.Types = Types;
Models.structure = Structure.registerDefinition;
Models.structures = Structure.structures;
Models.model = Document.registerDefinition;
Models.models = Document.models;
Models.utils = utils;

Models.model(userDefinition);