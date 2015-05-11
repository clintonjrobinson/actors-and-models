"use strict";

exports = module.exports = function(Models) {
  return function *() {
    let projection = Models.Projection.projections[this.params.name];

    if (!projection) {
      throw new Error('Invalid Projection.');
    }

    let query = (this.request.body && this.request.body.fields) || {};
    this.body = yield projection.fetch(this, query);
  }
};