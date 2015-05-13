"use strict";

exports = module.exports = function(Models) {
  return function *() {
    let projection = Models.Projection.projections[this.params.name];

    if (!projection) {
      throw new Error('Invalid Projection.');
    }

    let query = (this.request.body && this.request.body.fields) || {};
    let params = projection.castParams(query);

    //Run security check
    if (!projection.secure(this, params)) {
      throw new Models.errors.NotAuthorizedError();
    }

    //Fetch results
    this.body = yield projection.fetch(this, params);
  }
};