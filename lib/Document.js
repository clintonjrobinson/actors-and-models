"use strict";
var compose = require('koa-compose');
var co = require('co');

var ObjectID = require('mongodb').ObjectID;
var Types = require('./Types');
var Common = require('./Common');
var Property = require('./Property');
var Validators = Common.Validators;
var errors = require('./errors');

var mongo;

class Document extends Common {

  /**
   * Owner is a special field that gives access to a specific user in the system.
   *
   * IE. A User object can normally only be updated by a System role.  But a User is the owner of
   * their own instance of a User Model.  So, a user can update their own instance.
   * @returns {boolean}
   */
  static get hasOwner() {
    return this.definition.properties._owner ? true : false;
  }

  /**
   * canPatchUpdate is false means that to perform an update, we must grab the whole document from the database.
   * We need to do this because there is business validation defined for it that requires looking at the whole document
   *
   * A non-patch update will be required IF the model has object level validation defined or if a function has been supplied
   * as a property level validator.
   * @returns {boolean}
   */
  static get canPatchUpdate() {
    //Cache this setting since it may require a bit of time to generate.
    if (this._canPatchUpdate === undefined) {
      //Right off the bat, if we have object level validation, this model cannot use patch updates
      if (this.validation) {
        this._canPatchUpdate = false;
        return this._canPatchUpdate;
      }

      for (var property in this.definition.properties) {
        for (var validator in this.definition.properties.validators) {
          //If this is not using a registered Validator, we are not sure we can patch update.
          if (!Validators[validator]) {
            this._canPatchUpdate = false;
            return this._canPatchUpdate;
          }
        }
      }

      //No special valdiation requirements?  We can patch update! Yay.
      this._canPatchUpdate = true;
    }

    return this._canPatchUpdate;
  }

  /**
   * Get one document by id.
   *
   * @param context
   * @param _id
   * @returns {Promise}
   */
  static *get (context, query, options) {
    var hasAccess = this.hasAccess(context, 'read');
    if (!hasAccess && !this.hasOwner) {
      //This user does not have access, and the Model does not allow Owners
      throw new errors.NotAuthorizedError();
    }

    options = options || {fields: {}};
    options.fields = this.secureRead(context);

    if (query.constructor === String) {
      query = {_id: new ObjectID(query)};
    } else if (query.constructor === ObjectID) {
      query = {_id: query};
    }

    if (!hasAccess && this.hasOwner) {
      //This user does not have access as per their role, but the Model allows owners.
      query._owner = this.getUser(context)._id;
    }

    var ret = yield mongo.findOne(this.collectionName, query, options);

    if (!ret) {
      throw new errors.NotFoundError();
    }

    return new this(ret);
  }

  /**
   * Remove a document from the database
   * @param context
   * @param doc An instance of this model, or an ObjectID or a string representing an ObjectID
   * @returns {Promise}
   */
  static *remove (context, doc) {
    if (!this.hasAccess(context, 'remove')) {
      throw new errors.NotAuthorizedError();
    }

    var id;

    if (doc.constructor === ObjectID) {
      id = doc;
    } else if (doc.constructor === Object) {
      id = new ObjectID(doc._id);
    } else if (doc.constructor === this) {
      id = doc._id;
    } else {
      throw new Error('Invalid ID supplied.');
    }

    var ret = new this(yield mongo.findAndRemove(self.collectionName, {_id: id}));
    return this.secureByAction(context, ret, 'read');
  }

  /**
   * Update one document in the database and return the updated doc
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static *update (context, doc) {
    if (!this.hasAccess(context, 'update')) {
      throw new new errors.NotAuthorizedError();
    }

    if (!doc) {
      throw new Error('Cannot update an empty Model');
    }

    if (doc.constructor !== this) {
      doc = new this(doc);
    }

    //Apply security rules.
    this.secureUpdate(context, doc);

    yield this.middleware.beforeValidate.call(doc, context);
    var validation = yield doc.validate(context);
    yield this.middleware.afterValidate.call(doc, context, validation);

    doc._updated = Date.now();
    doc._updatedBy = self.getUser()._id;

    yield this.middleware.beforeUpdate.call(doc, context);
    yield this.middleware.beforeSave.call(doc, context);

    var ret = new this(yield mongo.findAndModify(self.collectionName, {_id: doc._id}, {$set: doc.__data}, {new:true}));

    yield this.middleware.afterSave.call(ret, context);
    yield this.middleware.afterUpdate.call(ret, context);

    return ret;
  }

  /**
   * Create a new document in the database
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static *create (context, doc) {
    if (!this.hasAccess(context, 'create')) {
      throw new errors.NotAuthorizedError();
    }

    if (!doc) {
      throw new Error('Cannot create a null Model');
    }

    if (doc.constructor !== this) {
      doc = new this(doc);
    }

    //Secure the doc based on the user role
    this.secureCreate(context, doc);

    yield this.middleware.beforeValidate.call(doc, context);
    var validation = yield doc.validate();
    yield this.middleware.afterValidate.call(doc, context, validation);

    doc._created = Date.now();
    doc._updated = Date.now();
    doc._createdBy = this.getUser(context)._id;
    doc._updatedBy = this.getUser(context)._id;

    yield this.middleware.beforeCreate.call(doc, context);
    yield this.middleware.beforeSave.call(doc, context);

    var ret = new this(yield mongo.insert(this.collectionName, doc));

    yield this.middleware.afterSave.call(ret, context);
    yield this.middleware.afterCreate.call(ret, context);

    return ret;
  }

  /**
   * Count docs based on query
   * @param context
   * @param query
   * @returns {*}
   */
  static *count (context, query) {
    if (!this.access(context, 'read')) {
      throw new NotAuthorizedError();
    }

    return yield mongo.count(self.collectionName, query);
  }

  /**
   * Find documents by query, returns a Promise that resolves to a Cursor
   * @param context
   * @param query
   * @returns {Promise}
   */
  static *find (context, query) {
    var hasAccess = this.hasAccess(context, 'read');

    if (!hasAccess && !this.hasOwner) {
      throw new errors.NotAuthorizedError();
    }

    if (!hasAccess && this.hasOwner) {
      query._owner = this.getUser(context)._id;
    }

    var cursor = yield mongo.find(this.collectionName, query, {fields: this.secureRead(context)})

    var docs = yield cursor.toArray();
    for (var i=0; i<docs.length; i++) {
      docs[i] = new this(docs[i]);
    }

    return docs;
  }

  get _id() {
    return this.__data._id;
  }

  set _id(value) {
    if (this.__data._id) {
      throw new Error('Cant change _id once set');
    }

    this.__data._id = value;
  }

  get _owner() {
    return this.__data._owner;
  }

  set _owner(value) {
    this.__data._owner = value;
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
  *save (context) {
    //There is an _id set, this is an update.
    this._id
      ? yield* this.constructor.update(context, this)
      : yield* this.constructor.create(context, this)
    ;

    //TODO: we should be returning the save instance, not the same instance.
    return this;
  }

  *remove (context) {
    yield this.constructor.remove(context, this);
    return this;
  }

  *refresh (context) {
    var doc = yield this.constructor.get(context, this._id);
    this.constructor.patch(this, doc);
  }
}

exports = module.exports = Document;

Common.Document = Document;

Document.models = {};
Document.isModel = true;

Document.hooks = {};

Document.definition = {
  properties: {}
};

Document.definition.properties._id = new Property({
  name: '_id',
  type: ObjectID,
  validators: {
    Required: true
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
  type: ObjectID,
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
  type: ObjectID,
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