s = module.exports = function(Models) {
  var fields = JSON.parse(JSON.stringify(Models.constants.USER_SECURE_FIELDS));
  var User = Models.models.User;

  return function*() {
    if (!this.request.fields) {
      throw new Models.errors.MissingParametersError(['email']);
    } else {
      if (!this.request.fields.email) {
        throw new Models.errors.MissingParametersError(['email']);
      }

      if (!this.request.fields.password) {
        throw new Models.errors.MissingParametersError(['password']);
      }
    }

    let vars = {
      'login.email': this.request.fields.email.toLowerCase(),
      password: Models.utils.hashPassword(this.request.fields.password),
      status: { $ne: 'Disabled' }
    };

    let upd = { $set: { lastLogin: new Date() } };

    if (Models.api && Models.api.beforeLogin)
      yield Models.api.beforeLogin.call(this, vars, upd);

    let result = yield User.mongo.findOneAndUpdate(
      User.collectionName,
      vars,
      upd,
      { fields: fields }
    );

    if (!result.value) {
      throw new Models.errors.NotFoundError();
    }

    let user = result.value;
    this.session.userID = user._id;

    if (Models.api && Models.api.afterLogin)
      yield Models.api.afterLogin.call(this, user);

    yield Models.auth.setup(user);

    user.password = null;
    this.body = user;
  };
};
