"use strict";

var ObjectID = require('mongodb').ObjectID;

exports = module.exports = function(Models) {
  return Models.structure({
    name: 'Group',
    description: 'User Group.',
    properties: {
      _created: {
        type: Date
      },
      _updated: {
        type: Date
      },
      group: {
        type: ObjectID,
        validators: {
          Required: true
        }
      },
      roles: {
        type: String,
        array: true,
        validators: {
          Required: true,
          ArrayMinLength: 1
        }
      }
    }
  });
};
