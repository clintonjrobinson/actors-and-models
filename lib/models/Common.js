"use strict";

var Types = require('../types');
var errors = require('../errors');
var CONSTANTS = require('../constants');
var Property = require('./Property');
var utils = require('../utils');

if (!Object.assign) {
  Object.assign = require('object-assign');
}

class Common {
  constructor(properties, locale, parent, property) {
    this.__parent = parent;
    this.__property = property;

    this.__data = {
      _type: this.constructor.cls
    };

    //Are we constructing this for one language?  Or many languages?
    //TODO: allow configurable default locale.
    this.__locale = locale || 'en';

    //Create a new instance, using the getters and setters.
    if (properties) {
      for (let property in properties) {
        this.__setter(property, properties[property]);
        //this[property] = properties[property];
      }
    }

    this._observe();
  }

  //Changes made to any first level simple (not array || subDocument) properties
  //check security for update rights, if not throw out update
  //if cmd is update to null - unset the property
  //if cmd is delete - unset the property
  //if cmd is add or update - set the property

  //Changes made to any array (including subDocument)
  //check security for update rights, if not throw out update
  //if cmd is add - ignore all other splices and set the property to the full array
  //if cmd is delete - unset the property
  //if cmd is pullFromSet
  //if it is simple pull values from array
  //if it is subDocument pull values from array by _mg
  //if cmd is addToSet - add values to array
  //if it is simple add values to array
  //if it is subDocument add value toJSON to array (doc is new, so don't worry about its own changes)

  //If there are any subDocuments, iterate over them
  //Check security for update rights...
  //Check subDocument for changes.
  //if its an 'add' a whole new subdoc has been added, set the whole JSON.
  //if it is existing, and has its own changes
  //recursively call updateFromStream, set all changes using full path

  //If there are arrays with subDocuments, iterate over them and iterate over the whole array
  //check security...
  //recursively call updateFromStream


  _observe() {
    //Only observe changes on the client side
    //Already observing
    if (this.__changes) return;

    var self = this;
    self.__changes = {};
    self.__changeStream = [];

    Object.observe(self.__data, function(changes) {
      for (let change of changes) {
        //Record the change stream for future use
        self.__changeStream.push(change);

        //What property is being updated.
        var property = self.constructor.def.properties[change.name];
        //Not one that we care about, exit
        if (!property) return;

        var val = change.object[property.name];
        //If a subdoc is created, then we can ignore all further updates, and just take the JSON of the subdoc

        //If an array is created then we can ignore all further splice commands. and just set the whole value of the
        //array, because all contents are new.
        self.__changes[property.name] = {
          cmd: (change.type === 'delete' || val === null) ? 'unset' : 'set',
          val: val
        };
      }

      //This object has a parent, let the parent know that it's child has been updated.
      if (self.__parent) {
        self.__parent._observeChild(self.__property, self.__changes);
      }
    });
  }

  _observeChild(property, changes) {
    //We're already aware this child has changed.  Whether it be a set, or update.
    //TODO: more advanced cmds required?
    if (this.__changes[property.name]) {
      return;
    }

    this.__changes[property.name] = {cmd: 'sub', val: changes};

    //This object has a parent, propagate up the chain.
    if (this.__parent) {
      this.__parent._observeChild(this.__property, this.__changes);
    }
  }

  _observeArray(name) {
    var self = this;

    Array.observe(this.__data[name], function(changes) {
      for (let change of changes) {
        //Track some additional info that the observe event doesn't track.
        //change.property = name;
        //change.forArray = true;
        //Record the change stream for future use
        self.__changeStream.push(change);

        //What property is being updated.
        var property = self.constructor.def.properties[name];

        //Not one that we care about, exit
        if (!property) return;

        var tracked = self.__changes[property.name] || {cmd: 'array', pull: [], push: []};

        //Is the change already tracked and its a set? Ignore all these splices.
        if (tracked.cmd === 'set') {
          return;
        }

        if (change.type === 'update' || change.type === 'delete') {
          tracked.pull.push(change.oldValue);
        }

        if (change.type === 'update' || change.type === 'add') {
          tracked.push.push(change.object[change.name]);
        }

        if (change.type === 'splice') {
          if (change.removed && change.removed.length) {
            tracked.pull = tracked.pull.concat(change.removed);
          }

          if (change.addedCount) {
            tracked.push = tracked.push.concat(change.object.slice(change.index, change.index + change.addedCount));
          }
        }

        self.__changes[property.name] = tracked;
      }

      if (self.__parent) {
        self.__parent._observeChild(self.__property, self.__changes);
      }
    });
  }

  /**
   * Generic getter, used by all getters
   * @param name
   * @returns {*}
   * @private
   */
  __getter(name) {
    var property = this.constructor.def.properties[name];
    //Check to see if this property is complex.  IE, is this a LocaleString?
    //TODO: make more generic in future, now just supports LocaleString
    if (property.type.cls === "LocaleString") {
      if (this.__data[name]) {
        return this.__data[name].value;
      }
    }

    return this.__data[name];
  }

  /**
   * Generic setter, used by all property setters in the model.
   * @param name
   * @param value
   * @private
   */
  __setter(name, value) {
    var property = this.constructor.def.properties[name];

    //Trying to set a property that doesn't exist
    if (!property) {
      //TODO: should we throw an error here? Data may go missing.
      return;
    }

    var oldValue = this.__data[name];

    //If this is complex type
    if (property.isType && property.type.value && this.__data[name]) {
      //Some types implement the set value interface (like LocaleString), this means you don't great a new
      //instance of that type when being set.
      this.__data[name].value = value;
    } else {
      this.__data[name] = property.cast(value, this);
    }

    //Since this is behind a setter, Object.observe will no longer function properly for this object
    //so echo out the changes using getNotifier.
    Object.getNotifier(this).notify({
      type: (this.__data[name] === null || this.__data[name] === undefined) ? 'add' : 'update',
      name: name,
      object: this,
      oldValue: oldValue
    });

    if (property.isArray) {
      this._observeArray(name);
    }
  }

  /**
   * Validates this instance of this Model.  Passes thru to the the static validate method on the model.
   * @param method create, patch or update
   * @returns {*|Promise}
   */
  validate(context, method) {
    return this.constructor.validate(this, context, method);
  }

  /**
   * Returns if a property of this doc has changed.
   * @param name
   */
  hasChanged(name) {
    return this.constructor.hasChanged(this, name);
  }

  /**
   * Clone this instance
   * @returns {Common}
   */
  clone() {
    //TODO: this doesn't actually do a deep clone does it? Check to make sure.
    return new this.constructor(this.toJSON());
  }

  toJSON() {
    //Create a new object to return
    var ret = {_type: this.constructor.cls};

    //Data contains the JSON data.  But could also contain nested Structures or Hydrated docs
    for (let property of this.constructor.properties({isSubDocument: false})) {
      if (this.__data[property.name]) {
        ret[property.name] = this.__data[property.name];
      }
    }

    for (let property of this.constructor.properties([{isType: true}, {isSubDocument: true}])) {
      if (this.__data[property.name]) {
        if (property.isArray) {
          ret[property.name] = [];

          for (let i = 0; i < this.__data[property.name].length; i++) {
            ret[property.name][i] = this.__data[property.name][i].toJSON();
          }
        } else {
          ret[property.name] = this.__data[property.name].toJSON();
        }
      }
    }

    return ret;
  }

  setLocale(value) {
    this.__locale = value;

    for (let property of this.constructor.properties([{isSubDocument:true}, {isLocale:true}])) {
      if (this.__data[property.name]) {
        if (property.isArray) {
          for (var i=0; i<this.__data[property.name].length; i++) {
            this.__data[property.name][i].setLocale(value);
          }
        } else {
          this.__data[property.name].setLocale(value);
        }
      }
    }
  }

  /**
   * Creates a GeneratorFunction to iterate over the property defs, filtering based on
   * options passed in.
   *
   * @param opts
   */
  static *properties(options) {
    //Wrap in array, it there is no object, set to default.
    options = Array.isArray(options) ? options : options ? [options] : [{noOpts: true}];

    for (let name in this.def.properties) {
      let property = this.def.properties[name];

      let finalRet = false;

      for (let opts of options) {
        if (opts.noOpts) {
          finalRet = finalRet || true;
        } else {

          let ret = true;

          if (opts.isSubDocument) ret = ret && property.isSubDocument;
          if (opts.isSubDocument === false) ret = ret && !property.isSubDocument;
          if (opts.isType) ret = ret && property.isType;
          if (opts.isType === false) ret = ret && !property.isType;
          if (opts.isLocale) ret = ret && property.isLocale;
          if (opts.isLocale === false) ret = ret && !property.isLocale;
          if (opts.isModel) ret = ret && property.isModel;
          if (opts.isModel === false) ret = ret && !property.isModel;
          if (opts.isStructure) ret = ret && property.isStructure;
          if (opts.isStructure === false) ret = ret && !property.isStructure;
          if (opts.isHydrated) ret = ret && property.hydrate;
          if (opts.isHydrated === false) ret = ret && !property.hydrate;
          if (opts.isArray) ret = ret && property.array;
          if (opts.isArray === false) ret = ret && !property.array;
          if (opts.isReference) ret = ret && property.isReference;
          if (opts.isReference === false) ret = ret && !property.isReference;
          if (opts.hasValidators) ret = ret && property.validators ? true : false;
          if (opts.hasValidators === false) ret = ret && !property.validators;
          if (opts.isRequired) ret = ret && (property.validators && property.validators.Required);
          if (opts.isRequired === false) ret = ret && !(property.validators && property.validators.Required);

          finalRet = finalRet || ret;
        }
      }

      if (finalRet) {
        yield property;
      }
    }
  }

  /**
   * Validates an entire document against its Model def and returns a collection of Validation Results
   * @param doc The object to validate
   * @returns {boolean|Object}
   */
  static *validate(doc, method) {
    function runValidation(toValidate, method) {
      //Iterate thru all the properties defs that have validators.
      for (let property of model.properties({hasValidators: true})) {

        validation.results[property.name] = property.validate(toValidate, method);

        //Any one invalid property will cause this result to be overall invalid.
        if (validation.results[property.name] !== true) {
          validation.valid = false;
        }
      }
    }

    var model = this;

    var validation = {
      valid: true,
      results: {}
    };

    //Default to a patch update
    method = method || 'patch';

    if (!doc) {
      throw new Error('Null or empty object passed in.');
    }

    if (doc.constructor !== this) {
      throw new Error(`Invalid Model passed in, was expecting ${this.cls} but got ${doc.constructor.cls}.`);
    }


    runValidation(doc, method);

    if (!validation.valid) {
      throw new errors.ValidationError(validation);
    }

    return true;
  }

  /**
   * Secures an instance of a Model or Structure based on the security settings and the current
   * Users Role.
   * @param context
   * @param doc
   * @param action
   * @param securityDoc
   */
  static secureByAction(context, inDoc, action, securityDoc) {
    if (!inDoc) {
      return;
    }

    var doc = inDoc.__data || inDoc;
    var roles = this.getUserRoles(context, securityDoc || doc);

    //Look at the original Model def
    for (let property of this.properties()) {

      let allowed = property.canAction(roles, action);

      if (!allowed) {
        delete doc[property.name];
      } else if (allowed && property.isSubDocument) {
        if (property.isArray) {
          if (doc[property.name]) {
            for (let i = 0; i < doc[property.name].length; i++) {
              property.type.secureByAction(context, doc[property.name][i], action);
            }
          }
        } else {
          property.type.secureByAction(context, doc[property.name], action);
        }
      }
    }

    return inDoc;
  }

  /**
   * Secure update
   * @param context
   * @param doc
   */
  static secureUpdate(context, doc, securityDoc) {
    this.secureByAction(context, doc, 'update', securityDoc);
  }

  /**
   * Secure create
   * @param context
   * @param doc
   */
  static secureCreate(context, doc) {
    //Secure the doc
    this.secureByAction(context, doc, 'create');
  }

  /**
   * Creates a field map based on the current Users role of what properties they can see of this
   * Document or Structure
   * TODO: Currently if a read is specified for Owner role on a property,
   *       it will not be returned because of secureRead.
   *
   *       We don't know if this user is an Owner of doc yet.
   *
   * @param context
   * @returns {{}}
   */
  static secureRead(context, fields, doc) {
    var secure = {};

    //We are going to cache the secureRead field maps so we don't regenerate per role
    this.__secureRead = this.__secureRead || {};

    var roles = this.getUserRoles(context, doc);

    for (let role of roles) {
      let secureRole;

      //Cached copy exists
      if (this.__secureRead[role]) {
        secureRole = this.__secureRead[role];
      } else {
        secureRole = this.__secureRead[role] = {};

        //Create the field map for this role
        for (let property of this.properties()) {

          property.canRead(role)
            ? secureRole[property.name] = 1
            : delete secureRole[property.name]
          ;

          //If we have the determined the user can read this, and this is a subDocument, propagate
          //down the chain
          if (secureRole[property.name] && property.isSubDocument) {
            let subFields = property.type.secureRead(context, doc);

            for (let subName in subFields) {
              secureRole[property.name + '.' + subName] = subFields[subName];
            }
          }
        }
      }

      //Merge the field map for this role with the master field map.
      Object.assign(secure, secureRole);
    }

    //If there is a passed in field map, only allow readable fields
    if (fields) {
      for (let field in fields) {
        if (!secure[field]) {
          delete fields[field];
        }
      }

      return fields;
    }

    return secure;
  }

  /**
   * Returns only the Group roles associated with a CRUD action.  For example, if a model specifies that read is available
   * to GroupAdmin and GroupUser.  This will return ['Admin', 'User']
   * @param method  The CRUD operation
   * @returns {Array} A list of Group Roles
   */
  static getGroupRoles(method) {
    //Nothing defined for security?  Then there are no group roles.
    if (!this.def.secure || !this.def.secure[method]) {
      return false;
    }

    var roles = [];
    for (let role of this.def.secure[method]) {
      if (role === 'Group') {
        return true;
      }

      if (role.indexOf('Group') === 0) {
        roles.push(role.replace('Group', ''));
      }
    }

    return roles;
  }

  /**
   * Returns which groups IDs are applicable to this User based on the Model definition.
   * @param method The crud operation
   * @param userGroups The currently logged in users group roles.
   */
  static getValidGroupsByUser(method, userGroups, query) {
    var roles = this.getGroupRoles(method);

    var groups = [];

    //Any group role is valid.
    if (roles === true) {
      for (let userGroup of userGroups) {
        groups.push(userGroup.group);
      }
    } else if (roles !== false) {
      for (let userGroup of userGroups) {
        if (roles.indexOf(userGroup.role) !== -1) {
          groups.push(userGroup.group);
        }
      }
    }

    if (query) {
      query = Array.isArray(query) ? query : [query];
      let queryGroups = [];

      for (let queryGroup of query) {
        for (let group of groups) {
          if (queryGroup.toString() === group.toString()) {
            queryGroups.push(group);
          }
        }
      }

      groups = queryGroups;
    }

    return groups;
  }

  /**
   * Determines if a User role has access to this Model.  This Boolean is really a tri-boolean
   *
   * @param context
   * @param action
   * @param doc
   * @returns {boolean} true if they can, false if they can't, undefined if we are not sure because of ownerSecurity or groupSecurity
   */
  static canAccess(context, action, doc) {
    //By default, all Models are open to 'Anonymous' access
    var canAccess = true;

    var roles = this.getUserRoles(context, doc);

    //System account can do anything, mate.
    if (roles.indexOf('System') !== -1) {
      return true;
    }

    //Security has been defined for this Model, remove canAccess
    //Now access must explicitly be set for this User role
    if (this.def.secure && this.def.secure[action]) {
      let secure = this.def.secure[action];

      //Anonymous access is enabled, anyone can access.
      if (secure.indexOf('Anonymous') !== -1)  {
        return true;
      }

      canAccess = false;

      for (let role of roles) {
        if (secure.indexOf(role) !== -1) {
          return true;
        }
      }

      //If no additional security info was supplied, but this Model has extended security.  We are not sure if user can access.
      if (!doc && (this.hasOwnerSecurity || this.hasGroupSecurity)) {
        return undefined;
      }
    }

    return canAccess;
  }

  /**
   * Returns the currently logged in Users roles.  If supplied with a security doc, it will also tell you if
   * the user is in the Owner role or the Group role.
   * @param context
   * @param doc
   * @returns {Array.<String>}
   */
  static getUserRoles(context, doc) {
    var roles = [].concat(context.roles, []);

    //If owner security is enabled, and this User is the owner of this doc,
    //let them have the owner role!
    if (doc && this.hasOwnerSecurity) {
      if (doc._owner && doc._owner === context.user._id) {
        roles.push('Owner');
      }
    }

    //If group security is enabled, and the User is in a group that the doc in is
    //they let them have the Group role!
    if (doc && this.hasGroupSecurity && context.userGroups && doc._groups) {
      for (let group of doc._groups) {
        for (let userGroup of context.userGroups) {
          if (userGroup.group.toString() === group.toString()) {
            roles.push('Group');

            for (let groupRole of userGroup.roles) {
              roles.push('Group' + groupRole);
            }
            break;
          }
        }
      }
    }

    return roles;
  }

  static hasChanged(doc, name) {
    return doc.__changes[name];
  }

  static justTheData(doc) {
    if (!doc) return null;

    var ret = doc.__data;

    for (let property of this.properties({isSubDocument:true})) {
      if (doc.__data[property.name]) {
        if (property.isArray) {
          console.error('TODO: justTheData for arrays not implemented yet.');
        } else {
          ret[property.name] = property.type.justTheData(doc.__data[property.name]);
        }
      }
    }

    return ret;
  }

  static queryFromUpdateSet(updateSet, path, query) {
    function getFullName(name) {
      return path
        ? `${path}.${name}`
        : name
        ;
    }

    query = query || {};

    for (let name in updateSet) {
      let update = updateSet[name];
      let property = this.def.properties[name];
      let fullName = getFullName(name);

      if (update.cmd === 'unset') {
        query.$unset = query.$unset || {};
        query.$unset[fullName] = "";
      } else if (update.cmd === 'set') {
        query.$set = query.$set || {};
        if (property.isSubDocument) {
          query.$set[fullName] = property.type.justTheData(update.val);
        } else {
          query.$set[fullName] = update.val;
        }
      } else if (update.cmd === 'sub') {
        property.type.queryFromUpdateSet(update.val, fullName, query);
      } else if (update.cmd === 'array') {
        console.error('TODO: array not yet implemented', update);
      } else {
        console.error("TODO: updateSet command not yet implemented", update);
      }
    }

    return query;
  }
  /**
   * Applies an updateSet document to an instance of a model.  After this is complete, you should be able to
   * check the delta of the document again to get that exact same updateSet back.
   *
   * @param context the context of the currently executing request
   * @param doc the instance of a Model this updateSet is being applied to
   * @param updateSet an updateSet that contains the commands to perform this update
   * @param roles the current user roles.  This is passed in recursively from the top doc
   */
  static patch(context, doc, updateSet, roles) {
    if (doc.constructor !== this) {
      throw new Error(`Cannot call patch on different Models.  Expecting an instance of ${this.cls} but got ${doc.constructor.cls}.`);
    }

    for (let name in updateSet) {
      let update = updateSet[name];
      let property = this.def.properties[name];

      //Roll a security check to see if the user is allowed to set this property.
      //Are you on the client side?
      if (!this.isClient) {
        //On the server side, we must have the full security doc to run this check.
        roles = roles || this.getUserRoles(context, doc);

        //This user cannot update this value, continue to the next update.
        if (!property.canUpdate(roles)) {
          continue;
        }
      }

      if (update.cmd === 'unset') {
        doc[name] = null;
      } else if (update.cmd === 'set') {
        doc[name] = update.val;
      } else if (update.cmd === 'sub') {
        //This is a sub document, apply updates to the sub.
        property.type.patch(context, doc[name], update.val, roles);
      } else if (update.cmd === 'array') {
        //This is an array, we have some push and pull to do.
        if (!doc[name]) {
          //TODO: is this an error? We have assumed the array already exists.
          doc[name] = [];
        }

        for (let i=0; i<update.push.length; i++) {
          doc[name].push(update.push[i]);
        }

        for (let i=0; i<update.pull.length; i++) {
          for (let j=0; j<doc[name].length; j++) {
            //If this is an array of subdocs or types being pulled, do it by _mg
            if (property.isSubDocument || property.isType) {
              if (doc[name][j] && doc[name][j]._mg === update.pull[i]._mg) {
                doc[name].splice(i, 1);
              }
            } else {
              if (doc[name][j] === update.pull[i]) {
                doc[name].splice(i, 1);
              }
            }
          }
        }
      } else {
        console.error("TODO: updateSet command not yet implemented", update);
      }
    }
  }

  /**
   * Resets a document, clears all the changes and delta.
   * @param doc
   */
  static reset(doc) {
    //TODO: more to do here than just clear out changes?
    doc.__changes = {};
    doc.__changeStream = [];
  }

  static get description() {
    return this._def.description;
  }

  /**
   * TODO CLIENTSIDE hack Remove this and refactor for more intelligent client side models
   * @param def
   * @returns {*}
   */
  static serializeDefinition(def) {
    var str = `{
      name: "${def.name}",
      description: "${def.description}",
      properties: {
      `;
        for (var property in def.properties) {
          str += `${property}: ${Property.serialize(def.properties[property])},`;

          if (property.secure) {
            str += `secure: ${JSON.stringify(property.secure)}`;
          }
        }

        str += `}, `;

        if (def.secure) {
          str += `secure: ${JSON.stringify(def.secure)}`;
        }

      str += `
    }`;

    return str;
  }

  static _clientInit() {
    this.isClient = true;

    this.def = {
      properties: {}
    };

    try {
      var def = this._def;
      for (var name in def.properties) {

        //A type could be a string, or a ref to the type class itself. We need them all to be ref to the class
        if (def.properties[name].type.constructor === String) {
          def.properties[name].type = eval(def.properties[name].type);
        }

        this.def.properties[name] = new Property(def.properties[name], name);
      }
    } catch (e) {
      console.error(`Initializing ${this.cls} failed.`);
      console.error(e);
    }

    //Inherit the parents properties.
    Object.assign(this.def.properties, this.__proto__.def.properties);

    this.middleware = {};
    for (let hook of ['before', 'after']) {
      for (let method of ['Save', 'Create', 'Validate', 'Count', 'Find', 'Update']) {
        this.middleware[hook + method] = function *() {}
      }
    }
  }
}

exports = module.exports = Common;

Common.registerDefinition = function(def, isModel) {
  //Holds the javascript class that we will return
  var cls;
  var Document = Common.Document;
  var Structure = Common.Structure;

  //If this def doesn't extend a known def, inherit from our base classes
  var Extend;
  if (def.extend) {
    if (def.extend.constructor === 'String') {
      def.extend =  isModel
        ? Document.models[def.extend]
        : Structure.structures[def.extend]
      ;
    }

    Extend = def.extend;
  } else {
    Extend = isModel ? Document : Structure;
  }

  if (def.ownerSecurity) {
    def.properties._owner = {
      type: Types.ObjectID,
      secure: {
        update: ['System', 'Owner']
      }
    };
  }

  if (def.groupSecurity) {
    def.properties._groups = {
      type: Types.ObjectID,
      array: true,
      secure: {
        update: ['System']
      }
    };
  }

  var str = `
    class ${def.name} extends Extend {
      constructor (properties, locale, parent, property) {
        super(properties, locale, parent, property);
      }

      `;
      for (var property in def.properties) {
        //Check to make sure that there are no reserved properties being set.
        if (CONSTANTS.RESERVED_WORDS.indexOf(property) !== -1) {
          throw new Error('Cannot use a reserved word as a property : ' + property);
        }

        str +=`
          get ${property} () {
            return this.__getter('${property}');
          }

          set ${property} (value) {
            this.__setter('${property}', value);
          }
        `;
      }

      str += `

      static get API_PREFIX() {
        return "${CONSTANTS.API_PREFIX}";
      }

      static get cls() {
        return "${def.name}";
      }

      static get collectionName() {
        return "${def.name}";
      }

      static get _def() {
        return ${Common.serializeDefinition(def)};
      }
    }

    cls = ${def.name};

  `;

  eval(str);

  cls.def = def;

  process.nextTick(function() {
    for (var name in def.properties) {

      //A type could be a string, or a ref to the type class itself. We need them all to be ref to the class
      if (def.properties[name].type.constructor === String) {
        var parts = def.properties[name].type.split('.');
        if (parts[0] === 'Model') {
          def.properties[name].type = Document.models[parts[1]];
        } else {
          def.properties[name].type = Structure.structures[parts[1]];
        }
      }

      def.properties[name] = new Property(def.properties[name], name);
    }

    //Inherit the parents properties.
    Object.assign(cls.def.properties, Extend.def.properties);

    //Ensure any indexes are created.
    if (cls.isModel && cls.def.indexes) {

      cls.mongo.createIndexes(cls.collectionName, cls.def.indexes)
        .then(function (success) {
          //TODO: Do we care to let anyone know this worked?
        })
        .catch(function (err) {
          console.error(`Error creating indexes for ${cls.cls} `);
          console.error(err);
        });
    }
  });

  Extend.children = Extend.children || {};
  Extend.children[def.name] = cls;

  if (isModel) {
    cls.middleware = {};

    //Setup middleware hooks, allows for cleaner code elsewhere.
    for (let hook of ['before', 'after']) {
      for (let method of ['Save', 'Create', 'Validate', 'Count', 'Find', 'Update']) {
        cls.middleware[hook + method] = (def.middleware && def.middleware[hook + method])
          ? def.middleware[hook + method]
          : function *() {}
        ;
      }
    }
  }

  return cls;
};