"use strict";

var ObjectID = require('mongodb').ObjectID;
var Types = require('./Types');
var Common = require('./Common');
var Property = require('./Property');

var mongo;

class Document extends Common {

  /**
   * Heavy Updates means that to perform an update, we must grab the whole document from the database.
   * We need to do this because there is business validation defined for it that requires looking at the whole document
   *
   * Heavy Updates will be required IF the model has object level validation defined or if a function has been supplied
   * as a property level validator.
   * @returns {*}
   */
  static requiresHeavyUpdate() {
    //Cache this setting since it may require a bit of time to generate.
    if (this._requiresHeavyUpdate === undefined) {
      //Right off the bat, if we have object level validation, this model requires a heavy Updates
      if (this.validation) {
        this._requiresHeavyUpdate = true;
        return true;
      }

      for (var property in this.definition.properties) {
        for (var validator in this.definition.properties.validators) {
          //TODO: should we check for a string here instead?
          if (this.definition.properties.validators[validator].constructor === Function) {
            this._requiresHeavyUpdate = true;
            return true;
          }
        }
      }

      this._requiresHeavyUpdate = false;
    }

    return this._requiresHeavyUpdate;
  }

  /**
   * Get one document by id.
   *
   * @param context
   * @param _id
   * @returns {Promise}
   */
  static get (context, _id, options) {
    var self = this;

    options = options || {fields: {}};

    options.fields = self.secureRead(context);

    _id = _id.constructor !== ObjectID ? new ObjectID(_id) : _id;

    return new Promise(function(resolve, reject) {
      function wrap(doc) {
        if (!doc) {
          reject(new Error('Not found : ' + _id));
          return;
        }

        resolve(new self(doc));
      }

      self.hasAccess(context, 'read')
        ? mongo.findOne(self.collectionName, {_id: _id}, options).then(wrap).catch(reject)
        : reject(new Error('Not Authorized'))
      ;
    });
  }

  /**
   * Remove a document from the database
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static remove (context, doc) {
    var self = this;

    return new Promise(function(resolve, reject) {
      function wrap(doc) {
        if (!doc) {
          reject(new Error('Not found : ' + id));
          return;
        }

        resolve(new self(doc))
      }
      var id;

      if (doc.constructor === ObjectID) {
        id = doc;
      } else if (doc.constructor === Object) {
        try {
          id = new ObjectID(doc._id);
        } catch (e) {
          reject(e);
          return;
        }
      } else if (doc.constructor === this) {
        id = doc._id;
      } else {
        reject(new Error('Invalid ID supplied.'))
        return;
      }

      self.hasAccess(context, 'remove')
        ? mongo.findAndRemove(self.collectionName, {_id: id}).then(wrap).catch(reject)
        : reject(new Error('Not Authorized'))
      ;
    });
  }

  /**
   * Update one document in the database and return the updated doc
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static update (context, doc) {
    var self = this;

    //Apply security rules.
    self.secureUpdate(context, doc);

    //TODO: run before validate middleware?
    //yield this.middleware.validate;

    //TODO: Validate
    //yield doc.validate();

    return new Promise(function(resolve, reject) {
      function wrap(doc) {
        doc
          ? resolve(new self(doc))
          : reject(new Error('Not found'))
        ;
      }

      self.hasAccess(context, 'update')
        ? mongo.findAndModify(self.collectionName, {_id: doc._id}, {$set: doc.__data}, {new:true}).then(wrap).catch(reject)
        : reject(new Error('Not Authorized'))
      ;
    });

    //TODO: run after save middleware?
    //Return
  }

  /**
   * Create a new document in the database
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static create (context, doc) {
    var self = this;

    //TODO: before create

    //Secure the doc based on the user role
    self.secureCreate(context, doc);

    //TODO: Validate

    return new Promise(function(resolve, reject) {
      function wrap(doc) {
        resolve(new self(doc));
      }

      self.hasAccess(context, 'create')
        ? mongo.insert(self.collectionName, doc).then(wrap).catch(reject)
        : reject(new Error('Not Authorized'))
      ;
    });
  }

  /**
   * Count docs based on query
   * @param context
   * @param query
   * @returns {*}
   */
  static count (context, query) {
    return self.access(context, 'read')
      ? mongo.count(self.collectionname, query)
      : Promise.reject(new Error('Not Authorized'))
    ;
  }

  /**
   * Find documents by query, returns a Promise that resolves to a Cursor
   * @param context
   * @param query
   * @returns {Promise}
   */
  static find (context, query) {
    var self = this;

    return new Promise(function(resolve, reject) {
      function wrap(cursor) {
        cursor
          .toArray()
          .then(function(docs) {
            for (var i=0; i<docs.length; i++) {
              docs[i] = new self(docs[i]);
            }
            resolve(docs);
          })
          .catch(reject)
        ;
      }

      self.hasAccess(context, 'read')
        ? mongo.find(self.collectionName, query, {fields: self.secureRead(context)}).then(wrap).catch(reject)
        : reject(new Error('Not Authorized'))
      ;
    })
  }

  get _id() {
    return this.__id;
  }

  set _id(value) {
    if (this.__id) {
      throw new Error('Cant change _id once set');
    }

    this.__id = value;
  }

  get _created() {
    return this.__data._created;
  }

  set _created(value) {
    this.__data._created = value;
  }

  get _createdBy() {
    return this.__data._createdBy;
  }

  set _createdBy(value) {
    this.__data._createdBy = value;
  }

  get _updated() {
    return this.__data._updated;
  }

  set _updated(value) {
    this.__data._updated = value;
  }

  get _updatedBy() {
    return this.__data._updatedBy;
  }

  set _updatedBy(value) {
    this.__data._updatedBy = value;
  }

  /**
   * Save this instance
   * @param context
   */
  *update (context) {
    //TODO: We either need to save context in the object instance, or it needs to be passed in.

    yield* this.constructor.update(context, this);
  }

  *find (context) {

  }

  *remove (context) {
    yield* this.constructor.remove(context, this);
  }

  *refresh (context) {

  }
}

exports = module.exports = Document;

Common.Document = Document;

Document.models = {};
Document.isModel = true;

Document.middleware = {
  save: function(fn) {},
  create: function(fn) {},
  validate: function(fn) {},
  get: function(fn) {},
  remove: function(fn) {},
  find: function(fn) {},
  count: function(fn) {}
};

Document.definition = {
  properties: {}
};

Document.definition.properties._id = new Property({
  name: '_id',
  type: ObjectID,
  validators: {
    Required: true,
    ObjectID: true
  },
  security: {
    update: []
  }
});

Document.definition.properties._created = new Property({
  name: '_created',
  type: Date,
  validators: {
    Required: true
  },
  security: {
    update: []
  }
});

Document.definition.properties._createdBy = new Property({
  name: '_createdBy',
  type: Object,
  validators: {
    Required: true
  },
  security: {
    update: []
  }
});

Document.definition.properties._updated = new Property({
  name: '_updated',
  type: Date,
  validators: {
    Required: true
  },
  security: {
    update: []
  }
});

Document.definition.properties._updatedBy = new Property({
  name: '_updatedBy',
  type: Object,
  validators: {
    Required: true
  },
  security: {
    update: []
  }
});

//TODO: Probably a better way to do this.
//Probably model should be a part of our Mongo lib, refactor this later.
Document.setMongoConnection = function(_mongo) {
  mongo = _mongo;
};


Document.registerDefinition = function(definition) {
  Document.models[definition.name] = Common.registerDefinition(definition, true);
  return Document.models[definition.name];
};