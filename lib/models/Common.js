const Types = require('../types');
const errors = require('../errors');
const CONSTANTS = require('../constants');
const Property = require('./Property');

class Common {
  constructor(properties, locale, parent, property) {
    this.__parent = parent;
    this.__property = property;
    this.__changes = {};
    this.__arrays = {};

    this.__data = {
      _type: this.constructor.cls
    };

    //Are we constructing this for one language?  Or many languages?
    //TODO: allow configurable default locale.
    this.__locale = locale || 'en';

    //Create a new instance, using the getters and setters.
    if (properties) {
      for (let property in properties) {
        this.__setter(property, properties[property], true);
      }
    }

    //TODO: Do we want to do this?
    //if there is no mini guid set, set one
    if (
      this.constructor.isStructure &&
      (!properties || (properties && !properties._mg))
    ) {
      this.__data._mg = Types.MiniGuid();
    }
  }

  _childChanges(property, data) {
    //Already noted!  Don't need to propagate
    if (!this.__changes[property.name]) {
      //This is a subDocument propagating the changes up to its parent.
      //If it is an array, we need to remember which array item has been changed.
      //If we are already setting a whole array, we don't need to worry about this.

      if (property.isArray) {
        this.__changes[property.name] = {
          cmd: 'array',
          push: [],
          pull: [],
          sub: {}
        };
      } else if (data.constructor !== property.type) {
        //Check to see if this instance of a subdocument extends Structure.  We won't be able to do all the
        //patch and updateSet magic if it does, so instead, just set the whole thing.
        //TODO: Calling a full set updateSet  may cause unexpected errors later
        this.__changes[property.name] = {
          cmd: 'set',
          val: this.__data[property.name]
        };
      } else {
        this.__changes[property.name] = {
          cmd: 'sub',
          val: this.__data[property.name].__changes
        };
      }
    }

    if (property.isArray && this.__changes[property.name].cmd === 'array') {
      this.__changes[property.name].sub[data._mg] = data.__changes;
    }

    if (this.__parent) {
      this.__parent._childChanges(this.__property, this);
    }
  }

  _observeArray(name) {
    //Remember the original array that was set, we can only do dirty checking to see what has changed on an array.
    this.__arrays[name] = this.__data[name].concat([]);
  }

  /**
   * Generic getter, used by all getters
   * @param name
   * @returns {*}
   * @private
   */
  __getter(name) {
    var property = this.constructor.def.properties[name];
    //Check to see if this property is a type and that type defines a Value.  IE, is this a LocaleString?

    if (property.isType && property.type.hasValue && this.__data[name]) {
      return this.__data[name].value;
    }

    return this.__data[name];
  }

  /**
   * Generic setter, used by all property setters in the model.
   * @param name
   * @param value
   * @private
   */
  __setter(name, value, fromConstructor) {
    var property = this.constructor.def.properties[name];

    //Trying to set a property that doesn't exist
    if (!property) {
      //TODO: should we throw an error here? Data may go missing.
      return;
    }

    this.__data[name] = property.cast(value, this);

    if (!fromConstructor) {
      //Remember the changes.
      this.__changes[property.name] = {
        cmd: value === undefined || value === null ? 'unset' : 'set',
        val: this.__data[name]
      };

      //This object has a parent, propagate changes up the chain.
      if (this.__parent) {
        this.__parent._childChanges(this.__property, this);
      }
    }

    if (property.isArray && this.__data[name]) {
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
    var ret = { _type: this.constructor.cls };
    //Data contains the JSON data.  But could also contain nested Structures or Hydrated docs
    for (let property of this.constructor.properties({
      isSubDocument: false,
      isType: false
    })) {
      if (this.__data[property.name] !== undefined) {
        ret[property.name] = this.__data[property.name];
      }
    }

    for (let property of this.constructor.properties([
      { isType: true },
      { isSubDocument: true }
    ])) {
      if (this.__data[property.name] !== undefined) {
        if (property.isArray && this.__data[property.name] !== null) {
          ret[property.name] = [];

          for (let i = 0; i < this.__data[property.name].length; i++) {
            ret[property.name][i] = this.__data[property.name][i]
              ? this.__data[property.name][i].toJSON()
              : null;
          }
        } else {
          ret[property.name] = this.__data[property.name]
            ? this.__data[property.name].toJSON()
            : null;
        }
      }
    }

    return ret;
  }

  setLocale(value) {
    this.__locale = value;

    for (let property of this.constructor.properties([
      { isSubDocument: true },
      { isLocale: true }
    ])) {
      if (this.__data[property.name]) {
        if (property.isArray) {
          for (var i = 0; i < this.__data[property.name].length; i++) {
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
    options = Array.isArray(options)
      ? options
      : options
        ? [options]
        : [{ noOpts: true }];

    for (let name in this.def.properties) {
      let property = this.def.properties[name];

      let finalRet = false;

      for (let opts of options) {
        if (opts.noOpts) {
          finalRet = finalRet || true;
        } else {
          let ret = true;

          if (opts.isSubDocument) ret = ret && property.isSubDocument;
          if (opts.isSubDocument === false)
            ret = ret && !property.isSubDocument;
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
          if (opts.hasValidators)
            ret = ret && property.validators ? true : false;
          if (opts.hasValidators === false) ret = ret && !property.validators;
          if (opts.isRequired)
            ret = ret && (property.validators && property.validators.Required);
          if (opts.isRequired === false)
            ret = ret && !(property.validators && property.validators.Required);

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
  static async validate(doc, method) {
    const validation = {
      valid: true,
      results: {}
    };

    const runValidation = (toValidate, method) => {
      //Iterate thru all the properties defs that have validators.
      for (let property of this.properties({ hasValidators: true })) {
        validation.results[property.name] = property.validate(
          toValidate,
          method
        );

        //Any one invalid property will cause this result to be overall invalid.
        if (validation.results[property.name] !== true) {
          validation.valid = false;
        }
      }
    };

    //Default to a patch update
    method = method || 'patch';

    if (!doc) {
      throw new Error('Null or empty object passed in.');
    }

    if (doc.constructor !== this) {
      throw new Error(
        `Invalid Model passed in, was expecting ${this.cls} but got ${
          doc.constructor.cls
        }.`
      );
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

    const doc = inDoc.__data || inDoc;
    const roles = this.getUserRoles(context, securityDoc || doc);

    //Look at the original Model def
    for (let property of this.properties()) {
      let allowed = property.canAction(roles, action);

      if (!allowed) {
        delete doc[property.name];
      } else if (allowed && property.isSubDocument) {
        if (property.isArray) {
          if (doc[property.name]) {
            for (let i = 0; i < doc[property.name].length; i++) {
              property.type.secureByAction(
                context,
                doc[property.name][i],
                action
              );
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
    const secure = {};

    //We are going to cache the secureRead field maps so we don't regenerate per role
    this.__secureRead = this.__secureRead || {};

    const roles = this.getUserRoles(context, doc);

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
            ? (secureRole[property.name] = 1)
            : delete secureRole[property.name];

          //TODO: we want security to propagate to structures, but we need to do so in an intelligent way.

          //If we have the determined the user can read this, and this is a hydrated Model, propagate
          //down the chain
          if (
            secureRole[property.name] &&
            property.isModel &&
            property.hydrate
          ) {
            let subFields = property.type.secureRead(
              context,
              fields ? fields[property.name] : null,
              doc
            );

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

    const roles = [];
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
    const roles = this.getGroupRoles(method);

    let groups = [];

    //Any group role is valid.
    if (roles === true) {
      for (let userGroup of userGroups) {
        groups.push(userGroup.group);
      }
    } else if (roles !== false) {
      for (let userGroup of userGroups) {
        for (let groupRole of userGroup.roles) {
          if (roles.indexOf(groupRole) !== -1) {
            groups.push(userGroup.group);
          }
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
    //By default, all Models are open to anyone who is a user of the system.
    let canAccess = true;

    const roles = this.getUserRoles(context, doc);

    //System account can do anything, mate.
    if (roles.indexOf('System') !== -1) {
      return true;
    }

    //No user logged in (ie, the anonymous role)
    if (roles.length === 1 && roles[0] === 'Anonymous') {
      if (!this.def.secure || !this.def.secure[action]) {
        //No additional security has been specific, this user is Anonymous, so they can't access
        return false;
      }
    }

    //Security has been defined for this Model, remove canAccess
    //Now access must explicitly be set for this User role
    if (this.def.secure && this.def.secure[action]) {
      let secure = this.def.secure[action];

      //Anonymous access is enabled, anyone can access.
      if (secure.indexOf('Anonymous') !== -1) {
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
    const roles = [].concat(context.roles, []);

    //If owner security is enabled, and this User is the owner of this doc,
    //let them have the owner role!
    if (doc && this.hasOwnerSecurity && context.user) {
      if (doc._owner && doc._owner.equals(context.user._id)) {
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

    if (Array.isArray(doc)) {
      for (var i = 0; i < doc.length; i++) {
        doc[i] = this.justTheData(doc[i]);
      }

      return doc;
    }

    var ret = Object.assign({}, doc.__data);

    for (let property of doc.constructor.properties({ isSubDocument: true })) {
      if (doc.__data[property.name]) {
        ret[property.name] = property.type.justTheData(
          doc.__data[property.name]
        );
      }
    }

    for (let property of doc.constructor.properties({ isType: true })) {
      if (doc.__data[property.name]) {
        ret[property.name] = doc.__data[property.name].toJSON();
      }
    }

    return ret;
  }

  static queryFromUpdateSet(updateSet, path, query) {
    function getFullName(name) {
      return path ? `${path}.${name}` : name;
    }

    query = query || {};

    for (let name in updateSet) {
      let update = updateSet[name];
      let property = this.def.properties[name];
      let fullName = getFullName(name);

      if (update.cmd === 'unset') {
        query.$unset = query.$unset || {};
        query.$unset[fullName] = '';
      } else if (update.cmd === 'set') {
        query.$set = query.$set || {};

        if (property.isArray) {
          query.$set[fullName] = [];

          for (var i = 0; i < update.val.length; i++) {
            if (update.val[i] === null) {
              query.$set[fullName][i] = null;
            } else if (property.isSubDocument) {
              query.$set[fullName][i] = update.val[i].constructor.justTheData(
                update.val[i]
              );
            } else if (property.isType) {
              query.$set[fullName][i] = update.val[i].toJSON();
            } else {
              query.$set[fullName][i] = update.val[i];
            }
          }
        } else if (property.isSubDocument) {
          query.$set[fullName] = update.val
            ? update.val.constructor.justTheData(update.val)
            : undefined;
        } else if (property.isType) {
          query.$set[fullName] = update.val.toJSON();
        } else {
          query.$set[fullName] = update.val;
        }
      } else if (update.cmd === 'sub') {
        property.type.queryFromUpdateSet(update.val, fullName, query);
      } else if (update.cmd === 'array') {
        //TODO: is this even needed now?
        for (var i = 0; i < update.pull.length; i++) {
          query.$pullAll = query.$pullAll || {};
          query.$pullAll[fullName + update.pull[i].path] =
            query.$pullAll[fullName + update.pull[i].path] || [];
          query.$pullAll[fullName + update.pull[i].path].push(
            update.pull[i].val
          );
        }

        for (var i = 0; i < update.push.length; i++) {
          query.$addToSet = query.$addToSet || {};
          query.$addToSet[fullName] = query.$addToSet[fullName] || {
            $each: []
          };
          query.$addToSet[fullName].$each.push(update.push[i]);
        }
      } else {
        console.error('TODO: updateSet command not yet implemented', update);
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
      throw new Error(
        `Cannot call patch on different Models.  Expecting an instance of ${
          this.cls
        } but got ${doc.constructor.cls}.`
      );
    }

    for (let name in updateSet) {
      if (name === '_type') {
        continue;
      }

      let update = updateSet[name];
      let property = this.def.properties[name];

      if (!property) {
        throw new Error(`Invalid property name ${name} in updateSet`);
      }

      //Roll a security check to see if the user is allowed to set this property.
      //Are you on the client side?
      if (!this.isClient) {
        //On the server side, we must have the full security doc to run this check.
        roles = roles || this.getUserRoles(context, doc);

        //This user cannot update this value, continue to the next update.
        if (!property.canUpdate(roles)) {
          console.error('cant update', property, roles);
          continue;
        }
      }

      if (update.cmd === 'unset') {
        doc[name] = null;
      } else if (update.cmd === 'set') {
        doc[name] = update.val;
      } else if (update.cmd === 'sub') {
        //This is a sub document, apply updates to the sub.
        //Check to see if a sub-doc is inherited.
        if (doc[name].constructor.patch) {
          doc[name].constructor.patch(context, doc[name], update.val, roles);
        } else {
          property.type.patch(context, doc[name], update.val, roles);
        }
      } else if (update.cmd === 'array') {
        //This is an array, we have some push and pull to do.
        var arr = doc[name] || [];

        if (update.sub) {
          for (let mg in update.sub) {
            for (let i = 0; i < arr.length; i++) {
              if (arr[i]._mg === mg) {
                if (arr[i].constructor.patch) {
                  arr[i].constructor.patch(
                    context,
                    arr[i],
                    update.sub[mg],
                    roles
                  );
                } else {
                  property.type.patch(context, arr[i], update.sub[mg], roles);
                }
              }
            }
          }
        }

        if (update.push && update.push.length > 0) {
          for (let i = 0; i < update.push.length; i++) {
            //TODO: need to cast!
            arr.push(update.push[i]);
          }
        }

        if (update.pull && update.pull.length > 0) {
          for (let i = 0; i < update.pull.length; i++) {
            for (let j = 0; j < arr.length; j++) {
              //If this is an array of subdocs or types being pulled, do it by _mg
              if (property.isSubDocument && arr[j]._mg === update.pull[i].val) {
                arr.splice(j, 1);
              } else if (
                property.isReference &&
                arr[j]._id.equals(update.pull[i].val)
              ) {
                arr.splice(j, 1);
              } else if (
                property.type === Types.ObjectID &&
                arr[j].equals(update.pull[i].val)
              ) {
                arr.splice(j, 1);
              } else if (property.isType) {
                console.error(
                  'TODO: patch for array of Types not yet implemented'
                );
              } else if (arr[j] === update.pull[i].val) {
                arr.splice(j, 1);
              }
            }
          }
        }

        doc[name] = arr;
      } else {
        console.error('TODO: updateSet command not yet implemented', update);
      }
    }
  }

  /**
   * Returns an updateSet of all the changes to this doc since creation, or a reset.
   * @param doc
   */
  static delta(doc) {
    for (let property of this.properties({ isArray: true })) {
      let changes = doc.__changes[property.name];

      //The whole array is being set or removed, no need to calculate adds or pulls.
      if (changes && (changes.cmd === 'set' || changes.cmd === 'unset')) {
        continue;
      }

      //An array has been set, compare the original with the new one.
      if (doc.__arrays[property.name] && doc.__data[property.name]) {
        if (!changes) {
          changes = doc.__changes[property.name] = {
            cmd: 'array'
          };
        }

        if (!changes.push) {
          changes.push = [];
        }

        if (!changes.pull) {
          changes.pull = [];
        }

        for (let i = 0; i < doc.__data[property.name].length; i++) {
          let ival = doc.__data[property.name][i];

          let found = false;

          for (let j = 0; j < doc.__arrays[property.name].length; j++) {
            let jval = doc.__arrays[property.name][j];

            //item is in i and j, means no change
            if (property.isSubDocument && ival._mg === jval._mg) {
              found = true;
            } else if (property.isReference && ival._id === jval._id) {
              found = true;
            } else if (property.isType) {
              console.error(
                'TODO: delta on array of types not yet implemented'
              );
            } else if (ival === jval) {
              found = true;
            }
            //item is in i not j, means added
            //item not i is in j, means pulled

            if (found) break;
          }

          if (!found) {
            changes.push.push(ival);
          }
        }

        for (let j = 0; j < doc.__arrays[property.name].length; j++) {
          let jval = doc.__arrays[property.name][j];

          let found = false;

          for (let i = 0; i < doc.__data[property.name].length; i++) {
            let ival = doc.__data[property.name][i];

            //item is in i and j, means no change
            if (property.isSubDocument && ival._mg === jval._mg) {
              found = true;
            } else if (property.isReference && ival._id === jval._id) {
              found = true;
            } else if (property.isType) {
              console.error(
                'TODO: delta on array of types not yet implemented'
              );
            } else if (ival === jval) {
              found = true;
            }
            //item is in i not j, means added
            //item not i is in j, means pulled

            if (found) break;
          }

          if (!found) {
            if (property.isSubDocument) {
              changes.pull.push({ path: '._mg', val: jval._mg });
            } else if (property.isReference) {
              changes.pull.push({ path: '._id', val: jval._id });
            } else if (property.isType) {
              console.error(
                'TODO: delta on array of types not yet implemented'
              );
            } else {
              changes.pull.push({ path: '', val: jval });
            }
          }
        }

        //Clean up
        if (
          changes.push.length === 0 &&
          changes.pull.length === 0 &&
          !changes.sub
        ) {
          delete doc.__changes[property.name];
        } else {
          //This object has a parent, propagate changes up the chain.
          if (doc.__parent) {
            doc.__parent._childChanges(doc.__property, doc);
          }
        }
      }
    }

    for (let property of this.properties({
      isSubDocument: true,
      isArray: false
    })) {
      if (doc.__data[property.name]) {
        doc.__data[property.name].constructor.delta(doc.__data[property.name]);
      }
    }

    return doc.__changes;
  }

  /**
   * Resets a document, clears all the changes and delta.
   * @param doc
   */
  static reset(doc) {
    //TODO: more to do here than just clear out changes?
    doc.__changes = {};
    doc.__changeStream = [];
    doc.__arrays = {};

    for (let property of this.properties({ isArray: true })) {
      if (doc.__data[property.name]) {
        doc._observeArray(property.name);
      }
    }
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
      groupSecurity: ${def.groupSecurity},
      ownerSecurity: ${def.ownerSecurity},
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
      properties: {},
      name: this._def.name,
      description: this._def.description,
      groupSecurity: this._def.groupSecurity ? true : false,
      ownerSecurity: this._def.ownerSecuriry ? true : false
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
      for (let method of [
        'Save',
        'Create',
        'Validate',
        'Count',
        'Find',
        'Update',
        'Remove'
      ]) {
        this.middleware[hook + method] = function*() {};
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
      def.extend = isModel
        ? Document.models[def.extend]
        : Structure.structures[def.extend];
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
        update: ['System', 'GroupAdmin']
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

    str += `
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

    //Group security requires an index
    if (cls.hasGroupSecurity) {
      cls.def.indexes = cls.def.indexes || [];
      cls.def.indexes.push({
        key: { _groups: 1 },
        name: 'groupsecurity',
        unique: false,
        sparse: false
      });
    }

    //Owner security requires an index
    if (cls.hasOwnerSecurity) {
      cls.def.indexes = cls.def.indexes || [];
      cls.def.indexes.push({
        key: { _owner: 1 },
        name: 'ownersecurity',
        unique: false,
        sparse: false
      });
    }

    //Ensure any indexes are created.
    if (cls.isModel && cls.def.indexes) {
      cls.mongo
        .createIndexes(cls.collectionName, cls.def.indexes)
        .then(function(success) {
          //TODO: Do we care to let anyone know this worked?
        })
        .catch(function(err) {
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
      for (let method of [
        'Save',
        'Create',
        'Validate',
        'Count',
        'Find',
        'Update',
        'Remove'
      ]) {
        cls.middleware[hook + method] =
          def.middleware && def.middleware[hook + method]
            ? def.middleware[hook + method]
            : function*() {};
      }
    }

    if (def.api) {
      cls.api = def.api;
    }
  }

  return cls;
};
