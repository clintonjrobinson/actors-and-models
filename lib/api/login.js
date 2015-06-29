"use strict";

exports = module.exports = function(Models) {
  return function *() {
    if (!this.request.body || !this.request.body.fields){
      throw new Models.errors.MissingParametersError(['email']);
    } else {
      if (!this.request.body.fields.email) {
        throw new Models.errors.MissingParametersError(['email']);
      }

      if (!this.request.body.fields.password) {
        throw new Models.errors.MissingParametersError(['password']);
      }
    }


    let vars = {
      'login.email': this.request.body.fields.email.toLowerCase(),
      password: Models.utils.hashPassword(this.request.body.fields.password)
    };

    let user = yield Models.models.User.get(Models.systemContext, vars);

    this.session.user = user;
    yield Models.auth.setup();

    this.body = Models.models.User.secureByAction(this, user, 'read');
  }
};