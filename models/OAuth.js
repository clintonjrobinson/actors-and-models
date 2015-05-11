"use strict";

exports = module.exports = function(Models) {
  Models.structure({
    name: 'OAuth',
    properties: {
      source: {
        type: String,
        validators: {
          Required: true
        }
      },
      id: {
        type: String,
        validators: {
          Required: true
        }
      },
      accessToken: {
        type: String,
        validators: {
          Required: true
        }
      },
      refreshToken: {
        type: String
      }
    }
  });
};