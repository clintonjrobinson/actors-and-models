"use strict";

exports = module.exports = function(Models) {

  return function *() {
    let projection = Models.Projection.projections[this.params.name];

    if (!projection) {
      throw new Error('Invalid Projection.');
    }

    if (!projection.get && this.method === 'GET') {
      throw new errors.InvalidMethodError();
    }

    if (!projection.post && this.method === 'POST') {
      throw new errors.InvalidMethodError();
    }

    let query = (this.method === 'GET')
      ? (this.request.query || {})
      : (this.request.body && this.request.body.fields) || {}
    ;

    var opts = {};

    if (query.limit) {
      opts.limit = parseInt(query.limit);
      delete query.limit;
    }

    if (query.skip) {
      opts.skip = parseInt(query.skip);
      delete query.skip;
    }

    let params = projection.castParams(this, query);

    //Run security check
    if (!projection.secure(this, params)) {
      throw new Models.errors.NotAuthorizedError();
    }

    //Fetch results
    this.body = yield projection.fetch(this, params, opts);
  }
};