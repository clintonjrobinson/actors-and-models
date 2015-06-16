"use strict";


exports = module.exports = function(Models) {
  var router = new require('koa-router')({prefix: Models.constants.API_PREFIX});

  router
    .use(Models.app.getSession)
    .use(Models.auth.setup())
    .get('config.js', function *() {
      this.type = 'application/javascript';
      this.body = `window.App = window.App || {}; window.App.config = ${JSON.stringify(Models.config)};`;
    })

    .get('models.js', function *() {
      this.type = 'application/javascript';
      this.body = Models.clientJS();
    })

    .get('me', function *() {
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

      let opts = JSON.parse(JSON.stringify((this.request.body && this.request.body.fields) ? this.request.body.fields.options : {}));
      opts.json = true;

      this.body = yield model.count(this, this.request.body.fields.query, opts);
    })

    .post(':model/find', function *() {
      let model = Models.models[this.params.model];

      let opts = JSON.parse(JSON.stringify((this.request.body && this.request.body.fields) ? this.request.body.fields.options : {}));
      opts.json = true;

      this.body = yield model.find(this, this.request.body.fields.query, opts);
    })

    .post(':model/create', function *() {
      let model = Models.models[this.params.model];
      let ret = yield model.create(this, this.request.body.fields);
      this.body = model.secureByAction(this, ret, 'read');
    })

    .get(':model/:id/get', function *() {
      let model = Models.models[this.params.model];
      let id = new Models.Types.ObjectID(this.params.id);
      this.body = yield model.get(this, id, {json: true});
    })

    .post(':model/:id/get', function *() {
      let model = Models.models[this.params.model];
      let id = new Models.Types.ObjectID(this.params.id);

      let opts = JSON.parse(JSON.stringify((this.request.body && this.request.body.fields) ? this.request.body.fields.options : {}));
      opts.json = true;

      this.body = yield model.get(this, id, opts);
    })

    .get(':model/:id/remove', function *() {
      let model = Models.models[this.params.model];
      let id = new Models.Types.ObjectID(this.params.id);
      this.body = yield model.remove(this, id);
    })

    .post(':model/:id/update', function *() {
      let model = Models.models[this.params.model];
      let id = new Models.Types.ObjectID(this.params.id);
      let updateSet = (this.request.body && this.request.body.fields) || {};

      this.body = yield model.update(this, id, updateSet);
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
