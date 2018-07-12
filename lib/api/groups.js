exports = module.exports = function(Models) {
  Models.api.group = async function(
    userId,
    command,
    group,
    groupRole,
    toggleRole
  ) {
    const User = Models.models.User;

    const user = await User.get(
      Models.systemContext,
      { _id: userId },
      { fields: { groups: 1, roles: 1 } }
    );

    const userGroup = Models.utils.userInGroup(user, group);

    const query = { _id: userId };
    let update;

    //The command is to remove a whole group from the user, not just a role.
    if (command === 'remove' && !groupRole) {
      update = { $pull: { groups: { group: group } } };
    } else if (userGroup) {
      //Does the user already belong to that group?
      //if we are removing a role, and its the last role, we are actually pulling the whole group
      if (
        command === 'remove' &&
        userGroup.roles.length === 1 &&
        userGroup.roles[0] === groupRole
      ) {
        update = { $pull: { groups: { group: group } } };
      } else if (command === 'toggle') {
        //We are toggling a role, IE removing role and switching it for ToggleRole
        //Otherwise we are adding or removing just a role.
        for (let i = 0; i < userGroup.roles.length; i++) {
          if (userGroup.roles[i] === groupRole) {
            userGroup.roles.splice(i, 1, toggleRole);
          }
        }

        query['groups.group'] = group;

        update = {
          $set: {
            'groups.$.roles': userGroup.roles,
            'groups.$.updated': new Date()
          }
        };
      } else {
        query['groups.group'] = group;

        //Otherwise we are adding or removing just a role.
        update =
          command === 'add'
            ? {
                $addToSet: { 'groups.$.roles': groupRole },
                $set: { 'groups.$.updated': new Date() }
              }
            : {
                $pull: { 'groups.$.roles': groupRole },
                $set: { 'groups.$.updated': new Date() }
              };
      }
    } else if (command === 'add') {
      //Other wise, we are creating a whole new group record for them
      update = {
        $push: {
          groups: {
            _mg: Models.utils.guid(6),
            group: group,
            roles: [groupRole],
            created: new Date(),
            updated: new Date()
          }
        }
      };
    } else {
      //No way we should have gotten here.
      throw new Models.errors.MissingParametersError();
    }

    const updated = await User.mongo.findOneAndUpdate(
      User.collectionName,
      query,
      update,
      { new: true }
    );

    //TODO: only return the effected information, there is a security leak here of showing someone all the groups a user belongs to.
    return updated.value;
  };

  return function*() {
    const group = new Models.Types.ObjectID(this.request.fields.group);
    const role = this.request.fields.role;
    const toggleRole = this.request.fields.toggleRole;
    const command = this.request.fields.command;
    const id = new Models.Types.ObjectID(this.params.userId);

    //First check to see if the user trying to do this action has the permission to do so.
    //Are they an Admin?
    if (
      Models.utils.userHasRole(this.user, 'Admin') ||
      Models.utils.userHasGroupRole(this.user, group, 'Admin')
    ) {
      const result = yield Models.api.group(
        id,
        command,
        group,
        role,
        toggleRole
      );
      this.body = result.groups;
    } else {
      throw new Models.errors.NotAuthorizedError();
    }
  };
};
