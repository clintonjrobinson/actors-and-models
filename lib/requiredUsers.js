const utils = require('./utils');

exports = module.exports = function(Models) {
  async function RequiredUsers() {
    const User = Models.models.User;

    async function ensureSystemUser() {
      Models.systemUser = await User.mongo.findOne(User.collectionName, {
        'login.email': 'system@system.int'
      }); 

      //No System user found.  Create one.
      if (!Models.systemUser) {
        const user = {
          login: [{ email: 'system@system.int', primary: true }],
          name: 'System',
          password: utils.guid(32),
          roles: ['System']
        };

        console.warn(
          '- Actors & Models - no system user found.  Creating one.'
        );
        const systemUser = await User.mongo.insert(User.collectionName, user);
        Models.systemUser = new User(systemUser);
      }

      Models.systemContext = {
        session: { user: Models.systemUser },
        user: Models.systemUser,
        userId: Models.systemUser._id,
        roles: ['System'],
        isSystemContext: true
      };

      //TODO: Should this happen here?  Should refactor so this is decoupled.
      Models.Projection.systemContext = Models.systemContext;
    }

    async function ensureAnonymousUser() {
      try {
        Models.anonymousUser = await User.get(Models.systemContext, {
          'login.email': 'anonymous@anonymous.int'
        });
      } catch (e) {
        console.warn(
          '- Actors & Models - no anonymous user found.  Creating one.'
        );

        Models.anonymousUser = await User.create(
          Models.systemContext,
          new User({
            login: [{ email: 'anonymous@anonymous.int', primary: true }],
            name: 'Anonymous',
            password: utils.guid(32),
            roles: ['Anonymous']
          }),
          { overrideValidation: true }
        );
      }

      Models.anonymousContext = { session: { user: Models.anonymousUser } };
    }

    async function ensureAdministratorUser() {
      try {
        const administrator = await User.get(Models.systemContext, {
          'login.email': 'admin@admin.int'
        });
      } catch (e) {
        const password = utils.guid(32);

        console.warn(
          '- Actors & Models - no administrator user found.  Creating one with password: ' +
            password
        );
        //We want to remember this, so we will save it to the database
        await User.mongo.insert('Administrator', { password: password });

        await User.create(Models.systemContext, {
          login: [{ email: 'admin@admin.int', primary: true }],
          name: 'System Administrator',
          password: password,
          roles: ['Admin']
        });
      }
    }

    //Make sure the appropriate users have been set.
    try {
      await ensureSystemUser();
      await ensureAnonymousUser();
      await ensureAdministratorUser();

      Models.emitter.emit('amReady');
    } catch (err) {
      console.error(err);
      console.error(err.data);
      console.error(err.stack);

      //The application must exit here, if we don't have the required users nothing will work.
      process.exit();
    }
  }

  RequiredUsers();
};
