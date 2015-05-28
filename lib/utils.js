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

exports.collapseObject = function collapseObject(obj, name, ret) {
  ret = ret || {};

  for (var property in obj) {
    if (obj.hasOwnProperty(property)) {
      let val = obj[property];
      if (val.constructor === String || val.constructor === Date || val.constructor === Boolean) {
        ret[`${name}.${property}`] = val;
      } else if (val.constructor === Object) {
        collapseObject(obj, `${name}.${property}`, ret);
      } else {
        console.error('TODO: collapseObject value not handled ', val.constructor);
      }
    }
  }

  return ret;
};