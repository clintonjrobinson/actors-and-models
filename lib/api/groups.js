"use strict";

exports = module.exports = function(Models) {
  return function *() {
    var User = Models.models.User;
    var group = new Models.Types.ObjectID(this.request.body.fields.group);
    var role = this.request.body.fields.role;
    var command = this.request.body.fields.command;
    var id = new Models.Types.ObjectID(this.params.userId);

    //First check to see if the user trying to do this action has the permission to do so.
    //Are they an Admin?
    if (!Models.utils.userHasRole(this.user, 'Admin') || Models.utils.userHasGroupRole(this.user, group, 'Admin')) {
      throw new Models.errors.NotAuthorizedError;
    }

    //Get the current users security settings
    var userToModify = yield User.get(Models.systemContext, {_id: id}, {fields:{groups:1, roles:1}});

    var update;
    var query = {_id: id};

    var userGroup = Models.utils.userInGroup(userToModify, group);

    //The command is to remove a whole group from the user, not just a role.
    if (command === 'remove' && !role) {
      update = {$pull: {'groups.group': group}}
    } else if (userGroup) {
      //Does the user already belong to that group?

      //if we are removing a role, and its the last role, we are actually pulling the whole group
      if (command === 'remove' && userGroup.roles.length === 1 && userGroup.roles[0] === role) {
        update = {$pull: {'groups.group': group}}
      } else {
        query['groups.group'] = group;

        //Otherwise we are adding or removing just a role.
        update = (command === 'add')
          ? {$addToSet:{'groups.$.roles': role}}
          : {$pull:{'groups.$.roles': role}}
        ;
      }
    } else if (command === 'add') {
      //Other wise, we are creating a whole new group record for them
      update = {$push: {'groups': {group: group, roles: [role]}}};
    } else {
      //No way we should have gotten here.
      throw new Models.errors.MissingParametersError();
    }

    result = yield User.mongo.findOneAndUpdate(User.collectionName, query, update);

    this.body = result.groups;
  }
};