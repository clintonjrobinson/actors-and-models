"use strict";

var ObjectID = require('mongodb').ObjectID;

exports = module.exports = function(Models) {

  return Models.model({
    name: 'User',
    description: 'User model.',
    ownerSecurity: true,
    indexes: [
      {key: {emails:1}, name:'emails', unique:true, sparse:false},
      {key: {guid:1}, name:'guid', unique:true, sparse:true},
      {key: {'groups.group.$id':1}, name:'groups', unique:false, sparse:true}
    ],
    middleware: {
      beforeSave: function *() {
        //Hash that password!
        if (this.password) {
          this.password = require('../lib/utils').hashPassword(this.password);
        }
      },
      afterCreate: function *() {
        var User = this.constructor;
        User.mongo.findOneAndUpdate(User.collectionName, {_id: this._id}, {$set: {_owner: this._id}})
          .then(function (doc) {
            console.log('after create good?')
          })
          .catch(function(err) {
            console.error('After create');
            console.error(err);
          })
        ;
        //A user is its own owner. Mindbomb.
        this._owner = this._id;
      }
    },
    properties: {
      _owner: {
        type: ObjectID
      },
      groups: {
        type: Models.structures.Group,
        array: true,
        validators: {
          MaxLength: 12
        },
        secure: {
          read: ['System'],
          update: ['System']
        }
      },
      emails: {
        type: String,
        array: true,
        validators: {
          Email: true,
          ArrayMaxLength: 5,
          ArrayMinLength: 1
        },
        secure: {
          read: ['System', 'Admin', 'Owner'],
          update: ['System', 'Admin', 'Owner']
        }
      },
      password: {
        type: String,
        validators: {
          Required: true,
          MinLength: 6
        },
        secure: {
          read: ['System'],
          update: ['System', 'Admin', 'Owner']
        }
      },
      guid: {
        type: String,
        secure: {
          read: ['System'],
          update: ['System']
        }
      },
      source: {
        type: String,
        secure: {
          read: ['System', 'Admin', 'Owner'],
          update: ['System']
        }
      },
      status: {
        type: String,
        secure: {
          read: ['System', 'Admin', 'Owner'],
          update: ['System', 'Admin']
        }
      },
      name: {
        type: String,
        validators: {
          Required: true
        }
      },
      lastLogin: {
        type: Date,
        secure: {
          update: ['System']
        }
      },
      roles: {
        type: String,
        array: true,
        validators: {
          Required: true,
          NoReservedRoles: true
        },
        secure: {
          update: ['System', 'Admin']
        }
      },
      settings: {
        type: Object,
        secure: {
          read: ['System', 'Admin', 'Owner'],
          update: ['System', 'Admin', 'Owner']
        }
      },
      picture: {
        type: String,
        secure: {
          update: ['System', 'Admin', 'Owner']
        }
      },
      OAuth: {
        type: Object,
        array: true,
        secure: {
          read: ['System', 'Admin', 'Owner'],
          update: ['System']
        }
      }
    },
    secure: {
      create: ['System', 'Admin'],
      update: ['System', 'Admin', 'Owner'],
      remove: ['System', 'Admin']
    }
  });
};