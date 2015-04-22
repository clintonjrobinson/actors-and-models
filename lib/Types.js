"use strict";

var utils = require('./utils');

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

exports.Image = require('./types/Image').Image;
exports.Approval = require('./types/Approval').Approval;
exports.LocaleString = require('./types/LocaleString').LocaleString;

exports.ObjectID = require('mongodb').ObjectID;
