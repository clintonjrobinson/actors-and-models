"use strict";

var Types = require('../types');
var Common = require('./Common');
var Property = require('./Property');
var Validators = require('../validators');
var errors = require('../errors');
var utils = require('../utils');

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
  static get hasOwnerSecurity() {
    return this.def.ownerSecurity === true;
  }

  /**
   * GroupSecurity allows assigning security groups at run-time (vs. using harder-coded security roles).
   * This allows Actors to be moved into one or more groups that have special access to models as defined in their
   * secure definition.
   * @returns {boolean}
   */
  static get hasGroupSecurity() {
    return this.def.groupSecurity === true;
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

    if (canAccess === false) {
      //This user does not have access, and the Model does not allow Owners
      throw new errors.NotAuthorizedError();
    }

    if (!query) {
      throw new errors.MissingParametersError(['query']);
    }

    opts = opts || {};
    opts.fields = this.secureRead(context, opts.fields);

    if (query.constructor === String) {
      query = {_id: new Types.ObjectID(query)};
    } else if (query.constructor.name === "ObjectID") {
      query = {_id: query};
    }

    if (canAccess === undefined && this.hasOwnerSecurity) {
      //This user does not have access as per their role, but the Model allows owners.
      query._owner = context.userId;
    } else if (canAccess === undefined && this.hasGroupSecurity) {
      //This user does not have access as per their role, but the Model allows group security.
      query._groups = {$in: this.getValidGroupsByUser('read', context.userGroups)};
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

  //Object -- GroupAdmin GroupUser
  //User ._groups = {Admin: ['1234']}
  //User ._groups = [{group:'1234', role: 'Admin'}, {group:'12324', role]
  /**
   * Remove a document from the database
   * @param context
   * @param doc An instance of this model, or an ObjectID or a string representing an ObjectID
   * @returns {Promise}
   */
  static *remove(context, doc) {
    var canAccess = this.canAccess(context, 'remove');

    if (canAccess === false) {
      throw new errors.NotAuthorizedError();
    }

    var id;

    if (doc.constructor === Types.ObjectID) {
      id = doc;
    } else if (doc.constructor === Object) {
      id = new Types.ObjectID(doc._id);
    } else if (doc.constructor === this) {
      id = doc._id;
    } else {
      throw new Error('Invalid ID supplied.');
    }

    var query = {_id:id};

    if (canAccess === undefined && this.hasOwnerSecurity) {
      query._owner = context.userId;
    } else if (canAccess === undefined && this.hasGroupSecurity) {
      query._groups = {$in: this.getValidGroupsByUser('remove', context.userGroups)};
    }

    var ret = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/${id}/remove`)
      : yield mongo.findOneAndDelete(this.collectionName, {_id: id})
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
  static *update(context, id, updateSet, opts) {
    //Client side updates are much different.  All final validation must be done on the server anyways.
    if (this.isClient) {
      //TODO: do client side validation and return the results
      //Wait for changes to propagate.
      yield utils.noop();
      let fromServer = yield command(`${this.API_PREFIX}${this.cls}/${id._id}/update`, id.__changes);
      return new this(fromServer);
    }

    if (!updateSet) {
      throw new Error('Cannot apply an empty updateSet');
    }

    //accept an updateSet from client
    //pull the whole document from the database
    let data = yield mongo.findOne(this.collectionName, {_id: id});
    let doc = new this(data);

    //Run a simple security check, is this user not allowed to update this doc
    if (!this.canAccess(context, 'update', doc)) {
      throw new errors.NotAuthorizedError();
    }

    //apply the update to the doc in memory and secure the updateSet (remove any updates that are not allowed)
    this.patch(context, doc, updateSet);

    opts = opts || {};
    //secure the document (Remove any fields not allowed to be read)
    opts.projection = this.secureRead(context, opts.fields, doc);
    opts.upsert = false;
    opts.multi = false;
    opts.returnOriginal = false;
    delete opts.writeConcern;

    //System context can force override validation.  If you really, really know what you are doing.
    if (!(opts.overrideValidation && context.isSystemContext)) {
      yield this.middleware.beforeValidate.call(doc, context);
      var validation = yield doc.validate();
      yield this.middleware.afterValidate.call(doc, context, validation);
    }

    yield this.middleware.beforeUpdate.call(doc, context);
    yield this.middleware.beforeSave.call(doc, context);

    doc._updated = new Date();
    doc._updatedBy = context.userId;

    yield utils.noop(1);

    let query = this.queryFromUpdateSet(doc.__changes);

    console.log(query);
    let result = yield mongo.findOneAndUpdate(this.collectionName, {_id: doc._id},query, opts);
    let ret = new this(result.value);

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
    //Owner security doesn't apply to a new doc, it can't.
    //Group security can tho, so we are passing in the doc here, if it has _groups set, it will determine
    //if the user can create it based on the role they have, and what kind of _groups they are trying to set.
    if (!this.canAccess(context, 'create', doc)) {
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

    let groups;
    //secure create is going to overwrite all the _groups being set in, but during a create
    //if the user has rolled a security check and passed, they can set groups.  so store _groups and set them back
    //However, they may only set groups they belong to
    let modifyingGroups = this.hasGroupSecurity
      && doc._groups
      && this.def.secure
      && this.def.secure.create
      && !utils.userHasRole(context.user, this.def.secure.create)
    ;

    if (modifyingGroups) {
      groups = [];

      for (let group of doc._groups) {
        if (utils.userInGroup(context.user, group)) {
          groups.push(group);
        }
      }
    }

    //Secure the doc based on the user role
    this.secureCreate(context, doc);

    if (this.hasGroupSecurity && modifyingGroups) {
      //Set the groups back
      doc._groups = groups;
    }

    //System context can force override validation.  If you really, really know what you are doing.
    if (!(opts.overrideValidation && context.isSystemContext)) {
      yield this.middleware.beforeValidate.call(doc, context);
      var validation = yield doc.validate('create');
      yield this.middleware.afterValidate.call(doc, context, validation);
    }

    doc._created = new Date();
    doc._updated = new Date();
    doc._createdBy = context.userId;
    doc._updatedBy = context.userId;
    //TODO: add owner as current user if model has owner?


    yield this.middleware.beforeCreate.call(doc, context);
    yield this.middleware.beforeSave.call(doc, context);

    var data = this.isClient
      ? yield command(`${this.API_PREFIX}${this.cls}/create`, doc.toJSON())
      : yield mongo.insert(this.collectionName, doc.toJSON())
    ;

    var ret = new this(data);

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
    var canAccess = this.access(context, 'read');

    if (canAccess === false) {
      throw new NotAuthorizedError();
    } else if (canAccess === undefined && this.hasOwnerSecurity) {
      query._owner = context.userId;
    } else if (canAccess === undefined && this.hasGroupSecurity) {
      query._groups = {$in: this.getValidGroupsByUser('read', context.userGroups)};
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

    query = query || {};

    if (canAccess === false) {
      throw new errors.NotAuthorizedError();
    } else if (canAccess === undefined && this.hasOwnerSecurity) {
      //This user does not have access as per their role, but the Model allows owners.
      query._owner = context.userId;
    } else if (canAccess === undefined && this.hasGroupSecurity) {
      //This user does not have access as per their role, but the Model allows group security.

      let groups = this.getValidGroupsByUser('read', context.userGroups, query._groups);
      query._groups = {$in: groups};
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

    if (!options.json) {
      for (var i = 0; i < docs.length; i++) {
        docs[i] = new this(docs[i]);
      }
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

  get _groups () {
    return this.__getter('_groups');
  }

  set _groups (value) {
    this.__setter('_groups', value);
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
    var saved;
    if (this._id) {
      saved = yield* this.constructor.update(context, this)
    } else {
      saved = yield* this.constructor.create(context, this)
    }

    return saved;
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
    if (!this.__def) {
      this.__def = {
        properties: {
          _id: new Property({
            type: Types.ObjectID,
            secure: {
              update: ['System']
            }
          }, '_id'),
          _created: new Property({
            type: Date,
            secure: {
              update: ['System']
            }
          }, '_created'),
          _createdBy: new Property({
            type: Types.ObjectID,
            secure: {
              update: ['System']
            }
          }, '_createdBy'),
          _updated: new Property({
            type: Date,
            secure: {
              update: ['System']
            }
          }, '_updated'),
          _updatedBy: new Property({
            type: Types.ObjectID,
            secure: {
              update: ['System']
            }
          }, '_updatedBy')
        }
      };
    }

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