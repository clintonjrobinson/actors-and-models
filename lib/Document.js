"use strict";
var compose = require('koa-compose');
var co = require('co');

var ObjectID = require('mongodb').ObjectID;
var Types = require('./Types');
var Common = require('./Common');
var Property = require('./Property');
var Validators = require('./validators').Validators;
var errors = require('./errors');

var mongo;

class Document extends Common {

  static get mongo() {
    return mongo;
  }
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

      for (let property of this.properties({hasValidators:true})) {
        for (var validator in property.validators) {
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
    var canAccess = this.canAccess(context, 'read');
    if (!canAccess && !this.hasOwner) {
      //This user does not have access, and the Model does not allow Owners
      throw new errors.NotAuthorizedError();
    }

    if (!query) {
      throw new errors.MissingParametersError(['query']);
    }

    options = options || {};
    options.fields = this.secureRead(context);

    if (query.constructor === String) {
      query = {_id: new ObjectID(query)};
    } else if (query.constructor === ObjectID) {
      query = {_id: query};
    }

    if (!canAccess && this.hasOwner) {
      //This user does not have access as per their role, but the Model allows owners.
      query._owner = context.userId;
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
    if (!this.canAccess(context, 'remove')) {
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

    var ret = yield mongo.findAndRemove(this.collectionName, {_id: id});
    ret = new this(ret);

    return this.secureByAction(context, ret, 'read');
  }

  /**
   * Update one document in the database and return the updated doc
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static *update (context, doc, opts) {
    //TODO: owner logic needs to be implemented
    if (!this.canAccess(context, 'update')) {
      throw new new errors.NotAuthorizedError();
    }

    if (!doc) {
      throw new Error('Cannot update an empty Model');
    }

    if (doc.constructor !== this) {
      doc = new this(doc);
    }

    opts = opts || {};
    opts.fields = this.secureRead(context);

    //Apply security rules.
    this.secureUpdate(context, doc);

    //System context can force override validation.  If you really, really know what you are doing.
    if (!(opts.overrideValidation && context.isSystemContext)) {
      yield this.middleware.beforeValidate.call(doc, context);
      var validation = yield doc.validate(context);
      yield this.middleware.afterValidate.call(doc, context, validation);
    }

    doc._updated = new Date();
    doc._updatedBy = context.userId;

    yield this.middleware.beforeUpdate.call(doc, context);
    yield this.middleware.beforeSave.call(doc, context);

    var ret = yield mongo.findAndModify(this.collectionName, {_id: doc._id}, {$set: this.delta(doc)}, {new:true, fields: opts.fields});
    ret =  new this(ret);

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
  static *create (context, doc, opts) {
    if (!this.canAccess(context, 'create')) {
      throw new errors.NotAuthorizedError();
    }

    if (!doc) {
      throw new Error('Cannot create a null Model');
    }

    if (doc.constructor !== this) {
      doc = new this(doc);
    }

    opts = opts || {};

    //Secure the doc based on the user role
    this.secureCreate(context, doc);

    //System context can force override validation.  If you really, really know what you are doing.
    if (!(opts.overrideValidation && context.isSystemContext)) {
      yield this.middleware.beforeValidate.call(doc, context);
      var validation = yield doc.validate(context, 'create');
      yield this.middleware.afterValidate.call(doc, context, validation);
    }

    doc._created = new Date();
    doc._updated = new Date();
    doc._createdBy = context.userId;
    doc._updatedBy = context.userId;
    //TODO: add owner as current user if model has owner?


    yield this.middleware.beforeCreate.call(doc, context);
    yield this.middleware.beforeSave.call(doc, context);

    var ret = yield mongo.insert(this.collectionName, doc.toJSON());
    ret = new this(ret);

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
    var canAccess = this.canAccess(context, 'read');

    if (!canAccess && !this.hasOwner) {
      throw new errors.NotAuthorizedError();
    }

    if (!canAccess && this.hasOwner) {
      query._owner = context.userId;
    }

    var cursor = yield mongo.find(this.collectionName, query, {fields: this.secureRead(context)})
    var docs = cursor;

    if (!Array.isArray(docs)) {
      docs = yield cursor.toArray();
    }

    for (var i=0; i<docs.length; i++) {
      docs[i] = new this(docs[i]);
    }

    return docs;
  }

  static get isModel() {
    return true;
  }

  static get isStructure() {
    return false;
  }

  get _id() {
    return this.__data._id;
  }

  set _id(value) {
    if (this.__data._id) {
      //throw new Error('Cant change _id once set');
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

Document.definition = {
  properties: {}
};

Document.definition.properties._id = new Property({
  type: ObjectID,
  security: {
    update: []
  }
}, '_id');

Document.definition.properties._created = new Property({
  type: Date,
  security: {
    update: []
  }
}, '_created');

Document.definition.properties._createdBy = new Property({
  type: ObjectID,
  security: {
    update: []
  }
}, '_createdBy');

Document.definition.properties._updated = new Property({
  type: Date,
  security: {
    update: []
  }
}, '_updated');

Document.definition.properties._updatedBy = new Property({
  type: ObjectID,
  security: {
    update: []
  }
}, '_updatedBy');

//TODO: Probably a better way to do this.
//Probably model should be a part of our Mongo lib, refactor this later.
Document.setMongoConnection = function(_mongo) {
  mongo = _mongo;
};


Document.registerDefinition = function(definition) {
  Document.models[definition.name] = Common.registerDefinition(definition, true);
  return Document.models[definition.name];
};