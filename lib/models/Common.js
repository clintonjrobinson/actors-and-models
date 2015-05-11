"use strict";

var ObjectID = require('mongodb').ObjectID;

var errors = require('../errors');
var CONSTANTS = require('../constants');

var Property = require('./Property');

if (!Object.assign) {
  Object.assign = require('object-assign');
}

class Common {
  constructor() {
    this.__data = {
      _type: this.constructor.cls
    };

    //Are we constructing this for one language?  Or many languages?
    //TODO: allow configurable default locale.
    this.__locale = arguments[1] || 'en';

    let properties = arguments[0];

    //Create a new instance, using the getters and setters.
    if (properties) {
      for (let property in properties) {
        this[property] = properties[property];
      }
    }

    this.observe();
  }

  observe() {
    var self = this;
    self.__changes = self.__changes || {};

    if (!Object.observe) return;

    Object.observe(self.__data, function(changes) {

      for (let change of changes) {
        switch (change.type) {
          case 'add':
          case 'update':
            self.__changes[change.name] = change.object[change.name];
            break;
        }
      }
    });
  }

  observeArray(toObserve, toUpdate) {
    //toUpdate.__changes = toUpdate.__changes || {};

    if (!Array.observe) return;

    Array.observe(toObserve, function(changes) {
    })
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
    if (!property) {
      console.log(this.constructor.def);
    }

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

    //subdocument
    //new - the whole \subdoc is new
    //patch - patching specific parts of it

    //array of primitives
    //new - whole array is new
    //add - we are adding something into the array, but what position?
    //pull - we are pulling something from an array, doesn't matter what position

    //array of subdocuments
    //new - the whole array is new
    //add - we are adding something new into the array,
    //patch - we are patching one entry.
    //pull - we are removing or more entries

    //TODO: generalize this into a pattern for complex Types
    //if this is a LocalString, check to see if it already exists.
    if (property.type.cls === 'LocaleString' && this.__data[name]) {
      this.__data[name].value = value;
    } else {
      this.__data[name] = property.cast(value, this);
    }

    //Since this is behind a setter, the Object.observe will no longer function
    //so broadcast out the changes using getNotifier.
    if (Object.getNotifier) {
      Object.getNotifier(this).notify({
        type: 'update',
        name: name,
        object: this,
        oldValue: 'test'
      });
    }

    if (property.array && this.observeArray) {
      this.observeArray(this.__data[name], this.__data[name]);
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
    return new this.constructor(this.__data);
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


    if (this.isStructure || method === 'create' || (method === 'update' && this.canPatchUpdate) || (method === 'patch' && this.canPatchUpdate)) {
      //This model is a Structure OR
      //This is a create, so we run full validation on it OR
      //This is a patch update, and we are allowed to patch this model! No need to pull the full doc.
      runValidation(doc, method);
    } else if ((method === 'update' && !this.canPatchUpdate) || (method === 'patch' && !this.canPatchUpdate)) {
      //If we cannot Patch Update this model, we need to pull the whole doc from the database, apply the patch, and then validate.
      let current = yield this.get(global.systemContext, doc._id);

      //Apply the patch update.
      this.patch(current, doc);

      runValidation(current, 'update');
    } else {
      //How did we get here?
      throw new Error(`Invalid Validation options passed in. ${method} ${this.canPatchUpdate}`);
    }

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
  static secureByAction(context, doc, action, securityDoc) {
    if (!doc || !doc.__data) {
      return;
    }

    var roles = this.getUserRoles(context, securityDoc || doc);

    //Look at the original Model def
    for (let property of this.properties()) {

      let allowed = property.canAction(roles, action);

      if (!allowed) {
        delete doc.__data[property.name];
      } else if (allowed && property.isSubDocument) {
        if (property.isArray) {
          if (doc.__data[property.name]) {
            for (let i = 0; i < doc.__data[property.name].length; i++) {
              property.type.secureByAction(context, doc.__data[property.name][i], action);
            }
          }
        } else {
          property.type.secureByAction(context, doc.__data[property.name], action);
        }
      }
    }

    return doc;
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
    if (!this.secure || !this.secure[method]) {
      return [];
    }

    var roles = [];
    for (let role of this.secure[method]) {
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
  static getValidGroupsByUser(method, userGroups) {
    var roles = this.getGroupRoles(method);
    var groups = [];

    for (let userGroup of userGroups) {
      if (roles.indexOf(userGroup.role) !== -1) {
        groups.push(userGroup.group);
      }
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

      canAccess = false;

      for (let role of roles) {
        if (secure.indexOf(role) !== -1) {
          return true;
        }
      }
    }

    //If no additional security info was supplied, but this Model has extended security.  We are not sure if user can access.
    if (!doc && (this.hasOwnerSecurity || this.hasGroupSecurity)) {
      return undefined;
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
    try {

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
            if (userGroup.group === group) {
              for (let groupRole of userGroup.roles) {
                roles.push('Group' + groupRole);
              }
              break;
            }
          }
        }
      }

    } catch(err) {
      console.error(err);
      console.error(err.stack);
    }
    return roles;
  }

  static hasChanged(doc, name) {
    return doc.__changed[name] === true;
  }

  /**
   * Gets the delta of changes performed to this doc since creation, or since a reset.
   * @param doc
   */
  static delta(doc) {
    var ret = {};

    for (let property of this.properties({isSubDocument: false})) {
      if (doc.__changed[property.name]) {
        ret[property.name] = doc.__data[property.name];
      }
    }

    for (let property of this.properties({isSubDocument: true})) {
      if (doc.__data[property.name]) {
        if (property.isArray) {
          ret[property.name] = [];
          for (let i = 0; i < doc.__data[property.name].length; i++) {
            ret[property.name][i] = property.type.delta(doc.__data[property.name][i]);
          }
        } else {
          ret[property.name] = property.type.delta(doc.__data[property.name]);
        }
      }
    }

    if (this.isStructure) {
      ret._mg = doc._mg;
    }

    return ret;
  }

  /**
   * Apply a patch update to an instance of this model
   * @param doc
   * @param patch
   */
  static patch(doc, patch) {
    if (doc.constructor !== this || patch.constructor !== this) {
      throw new Error(`Cannot patch two different models.  Expecting ${this.cls} but got ${doc.constructor.cls} and ${patch.constructor.cls}.`);
    }

    //TODO: in the future allow addToSet for arrays, or removeFromSet for arrays.
    //Get all the properties that are just simple ones first.
    for (let property of this.properties({isSubDocument: false})) {
      //If its not null, apply the patched property over.
      if (patch[property.name] !== undefined) {
        doc[property.name] = patch[property.name];
      }
    }

    //Now do all the subdocuments.
    for (let property of this.properties({isSubDocument: true})) {
      if (patch[property.name] !== undefined) {
        //Arrays are trickier.
        //If the doc already has this array set, we will need to merge the unique instances into the array.
        // We are going to overwrite the whole thing.
        if (property.isArray) {
          //TODO: no we arent
          doc[property.name] = patch[property.name];
        } else {
          if (!doc[property.name]) {
            //There is no object existing in the doc. First create a new instance
            doc[property.name] = new property.type(patch[property.name]);
          }

          //Patch the existing instance
          property.type.patch(doc[property.name], patch[property.name]);
        }
      }
    }
  }

  /**
   * Resets a document, clears all the changes and delta.
   * @param doc
   */
  static reset(doc) {
    doc.__delta = {};
    doc.__changed = {};
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
      type: ObjectID,
      secure: {
        update: ['System', 'Owner']
      }
    };
  }

  if (def.groupSecurity) {
    def.properties._groups = {
      type: ObjectID,
      array: true,
      secure: {
        update: ['System']
      }
    };
  }

  var str = `
    class ${def.name} extends Extend {
      constructor (properties) {
        super(properties);
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
          console.error(`Error creating indexes for ${cls.constructor.cls} `);
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