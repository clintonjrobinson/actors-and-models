"use strict";

exports = module.exports = function(Models) {
  var router = new require('koa-router')({prefix: Models.constants.API_PREFIX});

  router
    .use(Models.api.session)
    .use(Models.auth.setup())

    .get('models.js', function *() {
      this.type = 'application/javascript';
      this.body = Models.clientJS();
    })

    .get('me', function *() {
      //var data = Models.models.User.secureByAction(this, this.user, 'read');

      if (this.query.format === 'jsonp') {
        this.type = 'application/javascript';
        this.body = `var user = ${JSON.stringify(this.user)};`;
        return;
      }

      this.body = {user: this.user};
    })

    .post('login', require('./api/login')(Models))

    .get('logout', require('./api/logout')(Models))
    .post('logout', require('./api/logout')(Models))

    .post('groups/:userId', require('./api/groups')(Models))

    .get('projection/:name', require('./api/projection')(Models) )
    .post('projection/:name', require('./api/projection')(Models) )

    .post(':model/count', function *() {
      let model = Models.models[this.params.model];

      if (model.api && model.api.count === false) throw new Models.errors.APISecuredError();

      let opts = JSON.parse(JSON.stringify((this.request.fields) ? this.request.fields.options : {}));
      opts.json = true;

      if (model.api && model.api.middleware && model.api.middleware.beforeCount) {
        yield model.api.middleware.beforeCount.call(this, this.request.fields.query, opts);
      }

      let count = yield model.count(this, this.request.fields.query, opts);

      if (model.api && model.api.middleware && model.api.middleware.afterCount) {
        yield model.api.middleware.afterCount.call(this, count);
      }

      this.body = count;
    })

    .post(':model/find', function *() {
      let model = Models.models[this.params.model];

      if (model.api && model.api.find === false) throw new Models.errors.APISecuredError();

      let opts = JSON.parse(JSON.stringify((this.request.fields && this.request.fields.options) ? this.request.fields.options : {}));
      opts.json = true;

      if (model.api && model.api.middleware && model.api.middleware.beforeFind) {
        yield model.api.middleware.beforeFind.call(this, this.request.fields.query, opts);
      }

      let found = yield model.find(this, this.request.fields.query, opts);

      if (model.api && model.api.middleware && model.api.middleware.afterFind) {
        yield model.api.middleware.afterFind.call(this, found);
      }

      this.body = found;
    })

    .post(':model/create', function *() {
      let model = Models.models[this.params.model];

      if (model.api && model.api.create === false) throw new Models.errors.APISecuredError();

      if (model.api && model.api.middleware && model.api.middleware.beforeCreate) {
        yield model.api.middleware.beforeCreate.call(this, this.request.fields);
      }

      let ret = yield model.create(this, this.request.fields);

      if (model.api && model.api.middleware && model.api.middleware.afterCreate) {
        yield model.api.middleware.afterCreate.call(this, ret);
      }

      this.body = model.secureByAction(this, ret, 'read');
    })

    .get(':model/:id/get', function *() {
      let model = Models.models[this.params.model];

      if (model.api && model.api.get === false) throw new Models.errors.APISecuredError();

      let query = {_id: new Models.Types.ObjectID(this.params.id)};
      let opts = {json: true};

      if (model.api && model.api.middleware && model.api.middleware.beforeGet) {
        yield model.api.middleware.beforeGet.call(this, query, opts);
      }

      var ret = yield model.get(this, query, opts);

      if (model.api && model.api.middleware && model.api.middleware.afterGet) {
        yield model.api.middleware.afterGet.call(this, ret);
      }

      this.body = ret;
    })

    .post(':model/:id/get', function *() {
      let model = Models.models[this.params.model];

      if (model.api && model.api.get === false) throw new Models.errors.APISecuredError();

      let query = {_id: new Models.Types.ObjectID(this.params.id)};
      let opts = JSON.parse(JSON.stringify(this.request.fields ? this.request.fields.options : {}));
      opts.json = true;

      if (model.api && model.api.middleware && model.api.middleware.beforeGet) {
        yield model.api.middleware.beforeGet.call(this, query, opts);
      }

      var ret = yield model.get(this, query, opts);


      if (model.api && model.api.middleware && model.api.middleware.afterGet) {
        yield model.api.middleware.afterGet.call(this, ret);
      }

      this.body = ret;
    })

    .get(':model/:id/remove', function *() {
      let model = Models.models[this.params.model];

      if (model.api && model.api.remove === false) throw new Models.errors.APISecuredError();

      let id = new Models.Types.ObjectID(this.params.id);

      if (model.api && model.api.middleware && model.api.middleware.beforeRemove) {
        yield model.api.middleware.beforeRemove.call(this, id);
      }

      let ret = yield model.remove(this, id);

      if (model.api && model.api.middleware && model.api.middleware.afterRemove) {
        yield model.api.middleware.afterRemove.call(this, ret);
      }

      this.body = ret;
    })

    .post(':model/:id/update', function *() {
      let model = Models.models[this.params.model];

      //TODO: security check should be rolled before middleware is called.

      if (model.api && model.api.update === false) throw new Models.errors.APISecuredError();

      let id = new Models.Types.ObjectID(this.params.id);
      let updateSet = this.request.fields || {};

      if (model.api && model.api.middleware && model.api.middleware.beforeUpdate) {
        yield model.api.middleware.beforeUpdate.call(this, id, updateSet);
      }

      let ret = yield model.update(this, id, updateSet);

      if (model.api && model.api.middleware && model.api.middleware.afterUpdate) {
        yield model.api.middleware.afterUpdate.call(this, ret);
      }

      this.body = ret;
    })

    .post(':model/:id/:path/:action', typeApi)
    .get(':model/:id/:path/:action', typeApi)
  ;

  function *typeApi (next) {
    if (this.params.model === Models.constants.APP_NAME) {
      yield next;
      return;
    }

    let model = Models.models[this.params.model];

    let id = new Models.Types.ObjectID(this.params.id);

    let path = this.params.path;
    let action = this.params.action;

    //If this model has a special property defined, there may be an api call hurr
    //Look for self.
    if (path.indexOf(Models.constants.PROPERTY_API_IDENTIFIER) === 0) {
      //The action will be passed in like this 'self.profile.image'
      //So we will split up the command and find the property it may be referring to
      var properties = path.split('.');
      properties.shift();

      let type = model;
      let property;

      for (let name of properties) {

        if (type && type.def.properties[name]) {
          property = type.def.properties[name];
          type = property._type;
        } else {
          throw new Error('Unrecognized command: ' + path + ':' + action);
        }
      }

      //This property type has a defined API
      if (type && type.api && type.api[action]) {
        //TODO: Roll a security check?
        yield type.api[action].call(this, {
          id: id,
          model: model,
          propertyName: path.replace(Models.constants.PROPERTY_API_IDENTIFIER, ''),
          property: property
        });
      }

      return;
    }

    throw new Error('Command not recongized.');
  };

  Models.app.use(router.routes());
};
