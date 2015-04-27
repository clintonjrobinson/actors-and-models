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
    return this.def.properties._owner ? true : false;
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

      for (let property of this.properties({hasValidators: true})) {
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
  static *get(context, query, opts) {
    var canAccess = this.canAccess(context, 'read');
    if (!canAccess && !this.hasOwner) {
      //This user does not have access, and the Model does not allow Owners
      throw new errors.NotAuthorizedError();
    }

    if (!query) {
      throw new errors.MissingParametersError(['query']);
    }

    opts = opts || {};
    opts.fields = this.secureRead(context, opts.fields);

    if (query.constructor === String) {
      query = {_id: new ObjectID(query)};
    } else if (query.constructor === ObjectID) {
      query = {_id: query};
    }

    if (!canAccess && this.hasOwner) {
      //This user does not have access as per their role, but the Model allows owners.
      query._owner = context.userId;
    }

    var ret = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/${query._id}/get`)
      : yield mongo.findOne(this.collectionName, query, opts)
    ;

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
  static *remove(context, doc) {
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

    var ret = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/${id}/remove`)
      : yield mongo.findAndRemove(this.collectionName, {_id: id})
    ;

    ret = new this(ret);

    return this.secureByAction(context, ret, 'read');
  }

  /**
   * Update one document in the database and return the updated doc
   * @param context
   * @param doc
   * @returns {Promise}
   */
  static *update(context, doc, opts) {
    //TODO: owner logic needs to be implemented
    if (!this.canAccess(context, 'update')) {
      throw new new errors.NotAuthorizedError();
    }

    if (!doc) {
      throw new Error('Cannot update an empty Model');
    }

    if (doc.constructor !== this) {
      let tmp =  new this(doc);
      console.log(tmp);
      doc = new this({_id: doc._id});
      console.log(doc);
      this.patch(doc, tmp);
      console.log(doc);
    }

    opts = opts || {};
    opts.fields = this.secureRead(context, opts.fields);
    opts.upsert = false;
    opts.multi = false;
    opts.new = true;
    delete opts.writeConcern;

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

    console.log({$set: this.delta(doc)}, {_id: doc._id});

    var ret = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/${doc._id}/update`, this.delta(doc))
      : yield mongo.findAndModify(this.collectionName, {_id: doc._id}, {$set: this.delta(doc)}, opts)
    ;

    ret = new this(ret);

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
  static *create(context, doc, opts) {
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
    delete opts.ordered;
    delete opts.writeConcern;

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

    var ret = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/create`, doc.toJSON())
      : yield mongo.insert(this.collectionName, doc.toJSON())
    ;

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
  static *count(context, query) {
    if (!this.access(context, 'read')) {
      throw new NotAuthorizedError();
    }

    return this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/count`, query)
      : yield mongo.count(self.collectionName, query)
    ;
  }

  /**
   * Find documents by query, returns a Promise that resolves to a Cursor
   * @param context
   * @param query
   * @returns {Promise}
   */
  static *find(context, query, options) {
    var canAccess = this.canAccess(context, 'read');

    if (!canAccess && !this.hasOwner) {
      throw new errors.NotAuthorizedError();
    }

    if (!canAccess && this.hasOwner) {
      query._owner = context.userId;
    }

    options = options || {};
    options.fields = this.secureRead(context, options.fields);

    var cursor = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/find`, query)
      : yield mongo.find(this.collectionName, query, options)
    ;

    var docs = cursor;

    if (!Array.isArray(docs)) {
      docs = yield cursor.toArray();
    }

    for (var i = 0; i < docs.length; i++) {
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

  get _id () {
    return this.__getter('_id');
  }

  set _id(value) {
    this.__setter('_id', value);
  }

  get _owner () {
    return this.__getter('_owner');
  }

  set _owner (value) {
    this.__setter('_owner', value);
  }


  get _created () {
    return this.__getter('_created');
  }

  set _created (value) {
    this.__setter('_created', value);
  }

  get _createdBy () {
    return this.__getter('_createdBy');
  }

  set _createdBy (value) {
    this.__setter('_createdBy', value);
  }

  get _updated () {
    return this.__getter('_updated');
  }

  set _updated (value) {
    this.__setter('_updated', value);
  }

  get _updatedBy () {
    return this.__getter('_updatedBy');
  }

  set _updatedBy (value) {
    this.__setter('_updatedBy', value);
  }

  /**
   * Save this instance
   * @param context
   */
  *save(context) {
    //There is an _id set, this is an update.
    this._id
      ? yield* this.constructor.update(context, this)
      : yield* this.constructor.create(context, this)
    ;

    //TODO: we should be returning the save instance, not the same instance.
    return this;
  }

  *remove(context) {
    yield this.constructor.remove(context, this);
    return this;
  }

  *refresh(context) {
    var doc = yield this.constructor.get(context, this._id);
    //TODO: review this refresh logic, does it make sense to patch here?
    this.constructor.patch(this, doc);
  }

  static get def() {
    this.__def = this.__def || {
      properties: {
        _id: new Property({
          type: ObjectID,
          security: {
            update: []
          }
        }, '_id'),
        _created: new Property({
          type: Date,
          security: {
            update: []
          }
        }, '_created'),
        _createdBy: new Property({
          type: ObjectID,
          security: {
            update: []
          }
        }, '_createdBy'),
        _updated: new Property({
          type: Date,
          security: {
            update: []
          }
        }, '_updated'),
        _updatedBy: new Property({
          type: ObjectID,
          security: {
            update: []
          }
        }, '_updatedBy')
      }
    };

    return this.__def;
  }

  static set def(val) {
    this.__def = val;
  }
}

exports = module.exports = Document;

Common.Document = Document;

Document.models = {};


//TODO: Probably a better way to do this.
//Probably model should be a part of our Mongo lib, refactor this later.
Document.setMongoConnection = function(_mongo) {
  mongo = _mongo;
};


Document.registerDefinition = function(def) {
  Document.models[def.name] = Common.registerDefinition(def, true);
  return Document.models[def.name];
};