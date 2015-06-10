"use strict";

exports.userHasRole = function(user, roles) {
  if (!user || !user.roles) {
    return false;
  }

  roles = Array.isArray(roles) ? roles : [roles];

  for (let role of roles) {
    if (user.roles.indexOf(role) !== -1) {
      return true;
    }
  }

  return false;
};

exports.userInGroup = function(user, group) {
  if (!user || !user.groups) {
    return false;
  }

  for (let userGroup of user.groups) {
    if (userGroup.group.toString() === group.toString()) {
      return userGroup;
    }
  }
};

exports.userHasGroupRole = function(user, group, roles) {
  if (!user || !user.groups) {
    return false;
  }

  let userGroup = exports.userInGroup(user, group);
  roles = Array.isArray(roles) ? roles : [roles];

  if (userGroup) {
    for (let role of roles) {
      if (userGroup.roles.indexOf(role) !== -1) {
        return true;
      }
    }
  }

  return false;
};

exports.union = function (x, y) {
  var obj = {};

  x = x || [];
  y = y || [];

  for (let i = x.length-1; i >= 0; -- i)
    obj[x[i]] = x[i];
  for (let i = y.length-1; i >= 0; -- i)
    obj[y[i]] = y[i];
  var res = [];

  for (var k in obj) {
    if (obj.hasOwnProperty(k))  // <-- optional
      res.push(obj[k]);
  }
  return res;
};

exports.hashPassword = function(password) {
  return require('crypto').createHash('sha512').update(password).digest('base64');
};

/**
 * Generates a random guid of the specified length
 * @param len
 * @returns {string}
 */
exports.guid = function(len) {
  var UIDCHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  len = len || 16;

  var str = '';
  while (str.length < len) {
    str += UIDCHARS[(Math.random()*UIDCHARS.length)|0];
  }

  return str;
};

exports.getPropertyByPath = function(obj, path) {
  var val = obj;

  var props = path.split('.');

  for (var i=0; i<props.length; i++) {
    val = val[props[i]];
  }

  return val;
};

exports.collapseObject = function collapseObject(obj, name, sets, unsets, ignore) {
  function _collapsedName(property) {
    return name
      ? `${name}.${property}`
      : property
    ;
  }

  sets = sets || {__count:0};
  unsets = unsets || {__count:0};

  for (var property in obj) {
    if (obj.hasOwnProperty(property)) {
      let val = obj[property];
      let collapsedName = _collapsedName(property);
      if (val === null) {
        unsets[collapsedName] = "";
        unsets.__count++;
      } else if (val === undefined) {
        //noop
      } else if (val.constructor === String || val.constructor === Date || val.constructor === Boolean || val.constructor === Number || val.constructor.name === 'ObjectID') {
        sets[collapsedName] = val;
        sets.__count++;
      } else if (val.constructor === Object) {
        collapseObject(obj[property], collapsedName, sets, unsets, true);
      } else if (val.constructor === Array) {

      } else {
        console.error('TODO: collapseObject value not handled ', val.constructor);
      }
    }
  }

  if (!ignore) {
    var ret = {};
    if (sets.__count > 0) {
      ret.$set = sets;
    }

    delete sets.__count;

    if (unsets.__count > 0) {
      ret.$unset = unsets;
    }

    delete unsets.__count;

    return ret;
  }
};

exports.noop = function (wait) {
  wait = wait || 25; //ms
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve(true);
    }, wait)
  });
};