"use strict";

exports = module.exports = function(Models) {
  return function *() {
    this.session.userID = null;
    yield Models.auth.setup();

    this.body = {success: true};
  }
};