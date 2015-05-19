"use strict";

exports = module.exports = function(Models) {

  Models.api.group = function *(userId, command, group, groupRole) {
    var User = Models.models.User;
    var user = yield User.get(Models.systemContext, {_id: userId}, {fields: {groups: 1, roles: 1}});
    var userGroup = Models.utils.userInGroup(user, group);

    var query = {_id: userId};
    var update;

    //The command is to remove a whole group from the user, not just a role.
    if (command === 'remove' && !groupRole) {
      update = {$pull: {groups: {group: group}}};
    } else if (userGroup) {
      //Does the user already belong to that group?

      //if we are removing a role, and its the last role, we are actually pulling the whole group
      if (command === 'remove' && userGroup.roles.length === 1 && userGroup.roles[0] === groupRole) {
        update = {$pull: {groups: {group: group}}};
      } else {
        query['groups.group'] = group;

        //Otherwise we are adding or removing just a role.
        update = (command === 'add')
          ? {$addToSet: {'groups.$.roles': groupRole}}
          : {$pull: {'groups.$.roles': groupRole}}
        ;
      }
    } else if (command === 'add') {
      //Other wise, we are creating a whole new group record for them
      update = {$push: {'groups': {group: group, roles: [groupRole]}}};
    } else {
      //No way we should have gotten here.
      throw new Models.errors.MissingParametersError();
    }

    var updated = yield User.mongo.findOneAndUpdate(User.collectionName, query, update, {new:true});
    return updated.value;
  };

  return function *() {
    var group = new Models.Types.ObjectID(this.request.body.fields.group);
    var role = this.request.body.fields.role;
    var command = this.request.body.fields.command;
    var id = new Models.Types.ObjectID(this.params.userId);

    //First check to see if the user trying to do this action has the permission to do so.
    //Are they an Admin?
    if (Models.utils.userHasRole(this.user, 'Admin') || Models.utils.userHasGroupRole(this.user, group, 'Admin')) {
      var result = yield Models.api.group(id, command, group, role);
      this.body = result.groups;
    } else {
      throw new Models.errors.NotAuthorizedError;
    }
  }
};