"use strict";

exports = module.exports = function(Models) {
  return function() {
    //group/userId
    //{command: 'add', group: 1234, role: 'Admin'}

    let group = new Models.Types.ObjectID(this.request.body.fields.group);
    let role = this.request.body.role;
    let userId =
  }
};