"use strict";

const USER_SESSION_REFRESH = 5000; //ms

var errors = require('./errors');

exports = module.exports = function(Models) {
  var User = Models.models.User;
  var fields = JSON.parse(JSON.stringify(Models.constants.USER_SECURE_FIELDS));

  var auth = {
    setup: function () {
      return function *(next) {
        if (this._amsetup) {
          if (next) yield next;
          return;
        }

        this._amsetup = true;

        //Check to see if there is even a user for this session
        if (this.session && this.session.userID) {
          let userData = yield User.mongo.findOne(User.collectionName, {_id: Models.Types.ObjectID(this.session.userID)}, {fields: fields});
          this.user = new User(userData);
        } else {
          this.user = null;
        }

        this.userId = (this.user) ? this.user._id : null;
        this.userGroups = (this.user && this.user.groups) ? this.user.groups : [];

        //Explode out just the _ids
        this.userGroupIds  = [];
        for (let userGroup of this.userGroups) {
          this.userGroupIds.push(userGroup.group);
        }

        this.roles = (this.user && this.user.roles) ? this.user.roles : [];

        //Any logged in user can do anything an Anonymous user can do, and by default a non-logged in user IS anonymous
        if (this.roles.indexOf('Anonymous') == -1) {
          this.roles.push('Anonymous');
        }

        if (next) {
          yield next;
        }
      }
    },
    /**
     * Authorize a user based on the roles.  If no roles are passed in, just checks to see if a user is logged in at all.
     * @param roles
     * @returns {Function}
     */
    authorize: function (roles, redirect) {
      return function *(next) {
        if (!this._amsetup) {
          yield auth.setup();
        }

        var authorized = false;

        if (!this.user) {
          throw new errors.NotLoggedInError(this.path);
        }

        if (!this.roles) {
          throw new errors.NotLoggedInError(this.path);
        }

        if (roles) {
          for (let role of roles) {
            if (this.roles.indexOf(role) !== -1) {
              authorized = true;
            }
          }

          if (!authorized) {
            throw new errors.NotAuthorizedError(redirect);
          }
        }

        yield next;
      }
    }
  };

  return auth;
};