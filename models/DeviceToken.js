'use strict';

exports = module.exports = function(Models) {
  Models.structure({
    name: 'DeviceToken',
    properties: {
      created: {
        type: Date
      },
      updated: {
        type: Date
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
          In: Models.constants.PUSH_SERVICES
        }
      }
    }
  });
};
