"use strict";

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
