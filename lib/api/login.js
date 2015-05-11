"use strict";

exports = module.exports = function(Models) {
  return function *() {
    let vars = {
      emails: this.request.body.fields.email,
      password: Models.utils.hashPassword(this.request.body.fields.password)
    };

    let user = yield Models.models.User.get(global.systemContext, vars);

    this.session.user = user;
    yield Models.auth.setup();

    this.body = Models.models.User.secureByAction(this, user, 'read');
  }
};