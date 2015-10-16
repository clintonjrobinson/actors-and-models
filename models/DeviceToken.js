"use strict";

exports = module.exports = function(Models) {
  Models.structure({
    name: 'DeviceToken',
    properties: {
      device: {
        type: String,
        validators: {
          Required: true
        }
      },
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