"use strict";

exports = module.exports = function(Models) {
  return function *() {
    let model = Models.Document.models[call[0]];
    let query = (this.request.body && this.request.body.fields && this.request.body.fields.query) || {};
    let options = (this.request.body && this.request.body.fields && this.request.body.fields.options) || {};
    let obj = (this.request.body && this.request.body.fields) || {};

    switch (call[1]) {
      case 'find':
        options.json = true;

        this.body = yield model.find(this, query, options);
        break;

      case 'create':
      {
        this.enforcePost();
        break;
      }

      default:
      {
        let id = call[1];
        let action = call[2];
        let subAction = call[3];

        if (!id) {
          throw new Error('No ID provided');
        }

        try {
          id = new ObjectID(id);
        } catch (e) {
          throw new Error('Invalid ID supplied : ' + id);
        }

        switch (action) {
          case 'get':
            this.body = yield model.get(this, id, options);
            break;

          case 'remove':
            this.body = yield model.remove(this, id);
            break;

          case 'update':
            this.enforcePost();
            obj._id = id;
            this.body = yield model.update(this, obj, {fromClient: true});
            break;

          default:


            throw new Error('Unrecognized command: ' + action);
        }
      }
    }
  }
};