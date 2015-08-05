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
exports.S3Image = require('./S3Image').S3Image;
exports.Approval = require('./Approval').Approval;
exports.LocaleString = require('./LocaleString').LocaleString;

var ObjectID = exports.ObjectID = require('mongodb').ObjectID;
exports.DBRef = function(obj) {
  return {
    _id: ObjectID(obj._id.toString()),
    _type: obj._type
  };
};