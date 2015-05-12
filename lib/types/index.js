"use strict";

var utils = require('../utils');

function MiniGuid(value) {
  return value
    ? value
    : utils.guid(6)
  ;
}
exports.MiniGuid = MiniGuid;

function Guid(value) {
  return value
    ? value
    : utils.guid()
  ;
}
exports.Guid = Guid;

exports.Image = require('./Image').Image;
exports.Approval = require('./Approval').Approval;
exports.LocaleString = require('./LocaleString').LocaleString;

exports.ObjectID = require('mongodb').ObjectID;
exports.DBRef = require('mongodb').DBRef;

exports.ClientDBRef = function(obj) {
  if (obj.$id && obj.$ref) {
    return obj;
  }

  if (obj.oid && obj.namespace) {
    return obj;
  }

  if (obj._id && obj._type) {
    return {oid: obj._id, namespace: obj._type};
  }

  if (obj._id && obj.__data && obj.__data._type) {
    return {oid: obj._id, namespace: obj._type};
  }

  if (obj._id && obj.constructor && obj.constructor.cls) {
    return {oid: obj._id, namespace: obj.constructor.cls};
  }

  return {oid: obj._id, namespace: null};
};