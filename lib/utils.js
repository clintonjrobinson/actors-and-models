"use strict";

exports.hashPassword = function(password) {
  return require('crypto').createHash('sha512').update(password).digest('base64');
}

var UIDCHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a random guid of the specified length
 * @param len
 * @returns {string}
 */
exports.guid = function(len) {
  len = len || 16;

  var str = '';
  while (str.length < len) {
    str += UIDCHARS[(Math.random()*UIDCHARS.length)|0];
  }

  return str;
};


/**
 * Models have some built in functions and properties, because of this, we cannot allow some property
 * names to be used, because they will clash.
 * @type {string[]}
 */
exports.RESERVED_WORDS = [
  //Function names
  'create',
  'find',
  'remove',
  'update',
  'save',
  'count',
  'validate',
  'refresh',
  'toJSON',
  'toString',
  'clone',
  //System controlled properties
  '_id',
  '_created',
  '_createdBy',
  '_updated',
  '_updatedBy',
  //Meta-data properties
  '__data',
  '__changes',
  '__getter',
  '__setter'
];

exports.RESERVED_ROLES = [
  //The System account.  Essentially God mode.
  'System',
  //An Admin account.
  'Admin',
  //A meta-role, the User id specified in the _owner property of an instance of a model.
  'Owner',
  //A non-logged in user.
  'Anonymous'
];