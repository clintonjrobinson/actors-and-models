"use strict";

var co = require('co');

var Document = require('./models/Document');
var utils = require('./utils');

exports = module.exports = RequiredUsers;

function RequiredUsers(Models) {
  function *ensureSystemUser() {
    var User = Document.models.User;

    Models.systemUser = yield Models.mongo.findOne(User.collectionName, {login:'system'});

    //No System user found.  Create one.
    if (!Models.systemUser) {
      let user = {
        login: 'system',
        name: 'System',
        password: utils.guid(32),
        roles: ['System']
      };

      console.log('- Actors & Models - no system user found.  Creating one.');
      let systemUser = yield Models.mongo.insert(User.collectionName, user);
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
      //We want to remember this, so we will save it to the database
      yield Models.mongo.insert('Administrator', {password:password});

      yield User.create(global.systemContext, {
        login: 'admin',
        name: 'System Administrator',
        password: password,
        roles: ['Admin']
      });
    }
  }

  //Make sure the appropriate users have been set.
  co(function *() {
    yield ensureSystemUser;
    yield ensureAnonymousUser;
    yield ensureAdministratorUser;
  }).catch(function (e) {
    console.error(e);
    console.error(e.data);
    console.error(e.stack);

    //The application must exit here, if we don't have the required users nothing will work.
    process.exit();
  });
}
