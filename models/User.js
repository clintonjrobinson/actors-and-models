"use strict";

exports = module.exports = function(Models) {
  require('./DeviceToken')(Models);
  require('./Group')(Models);
  require('./OAuth')(Models);

  return Models.model({
    name: 'User',
    description: 'User model.',
    ownerSecurity: true,
    indexes: [
      {key: {emails:1}, name:'emails', unique:true, sparse:false},
      {key: {guid:1}, name:'guid', unique:true, sparse:true},
      {key: {'groups.group':1}, name:'groups', unique:false, sparse:true},
      {key: {'OAuth.id':1, 'OAuth.type': 1}, name:'ouath', unique:true, sparse:true},
      {key: {'deviceTokens.token':1}, name:'deviceToken', unique:true, sparse:true}
    ],
    middleware: {
      beforeCreate: function *() {
        this.password = require('../lib/utils').hashPassword(this.password);
      },
      beforeSave: function *() {
        //Hash that password
        if (this.hasChanged('password') && this.password) {
          this.password = require('../lib/utils').hashPassword(this.password);
        }

        //Make sure all emails are lower case!
        if (this.emails) {
          for (var i=0; i<this.emails.length; i++) {
            this.emails[i] = this.emails[i].toLowerCase();
          }
        }
      },
      afterCreate: function *() {
        var User = this.constructor;
        //A user is its own owner. Mindbomb.
        //A user is its own Admin of its own group.
        var group = new Models.structures.Group({group: this._id, roles: ['Admin']});

        User.mongo.findOneAndUpdate(User.collectionName, {_id: this._id}, {$set: {_owner: this._id}, $push: {groups: group.toJSON()}});

        this._owner = this._id;

        if (!this.groups) {
          this.groups = [];
        }

        this.groups.push(group);
      }
    },
    properties: {
      _owner: {
        type: Models.Types.ObjectID
      },
      groups: {
        type: Models.structures.Group,
        array: true,
        validators: {
          ArrayMaxLength: 24
        },
        secure: {
          update: ['System']
        }
      },
      emails: {
        type: String,
        array: true,
        validators: {
          Required: true,
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
      deviceTokens: {
        type: Models.structures.DeviceToken,
        array: true
      },
      OAuth: {
        type: Models.structures.OAuth,
        array: true,
        secure: {
          read: ['System', 'Owner'],
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