"use strict";

var errors = require('./errors');

exports = module.exports = function(Models) {
  return {
    setup: function () {
      return function *(next) {
        //First get setup some user helpers in the context
        this.user = (this.session && this.session.user)
          ? (this.session.user.constructor.cls === Models.models.User.cls) ? this.session.user : new Models.models.User(this.session.user)
          : null
        ;

        this.userId = (this.user) ? this.user._id : null;
        this.userGroups = (this.user && this.user.groups) ? this.user.groups : [];
        //Explode out just the _ids
        if (this.userGroups) {

        }

        this.roles = (this.user && this.user.roles) ? this.user.roles : ['Anonymous'];

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
    authorize: function (roles) {
      return function *(next) {
        var authorized = false;

        if (!this.user) {
          throw new errors.NotLoggedInError();
        }

        if (roles) {
          for (let role of roles) {
            if (this.userRoles.indexOf(role) !== -1) {
              authorized = true;
            }
          }

          if (!authorized) {
            throw new errors.NotAuthorizedError();
          }
        }

        yield next;
      }
    }
  }
};