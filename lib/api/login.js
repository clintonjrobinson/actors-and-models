"use strict";

exports = module.exports = function(Models) {
  var fields = {
    _id: 1,
    groups: 1,
    login: 1,
    status: 1,
    name: 1,
    lastLogin: 1,
    roles: 1,
    settings: 1,
    picture: 1
  };

  var User = Models.models.User;

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
      password: Models.utils.hashPassword(this.request.body.fields.password),
      status: {$ne: 'Disabled'}
    };

    let result = yield User.mongo.findOneAndUpdate(User.collectionName, vars, {$set: {lastLogin: new Date()}}, {fields: fields});

    if (!result.value) {
      throw new Models.errors.NotFoundError();
    }

    let user = result.value;
    this.session.userID = user._id;
    yield Models.auth.setup(user);

    this.body = user;
  }
};