"use strict";

exports = module.exports = function(Models) {
  Models.structure({
    name: 'DeviceToken',
    properties: {
      flavour: {
        type: String
      },
      token: {
        type: String,
        validators: {
          Required: true
        }
      },
      type: {
        type: String,
        validators: {
          Required: true,
          In: ['apns', 'bbps', 'gcm']
        }
      }
    }
  });
};