"use strict";

exports = module.exports = function(Models) {

  Models.structure({
    name: 'UserLogin',
    properties: {
      name: {
        type: String,
        validators: {
          MaxLength: 255
        }
      },
      primary: {
        type: Boolean,
        validators: {
          Required: true
        }
      },
      email: {
        type: String,
        validators: {
          MaxLength: 2000,
          Required: true,
          Email: true
        }
      },
      status: {
        type: String,
        validators: {
          In: ['Pending', 'Verified']
        }
      }
    }
  })
};
