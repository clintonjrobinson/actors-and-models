"use strict";

exports = module.exports = function(Models) {
  require('./DeviceToken')(Models);
  require('./Group')(Models);
  require('./OAuth')(Models);
  require('./UserLogin')(Models);

  return Models.model({
    name: 'User',
    description: 'User model.',
    ownerSecurity: true,
    api: {
      find: false,
      count: false
    },
    indexes: [
      {key: {'login.email':1}, name:'logins', unique:true, sparse:false},
      {key: {guid:1}, name:'guid', unique:true, sparse:true},
      {key: {unsubscribe:1}, name:'unsubscribe', unique:true, sparse:true},
      {key: {'groups.group':1, 'group.roles':1}, name:'groups', unique:false, sparse:true},
      {key: {'OAuth.id':1, 'OAuth.type': 1}, name:'ouath', unique:true, sparse:true},
      {key: {'deviceTokens.token':1, '_id':1}, name:'deviceToken', unique:true, sparse:true}
    ],
    middleware: {
      beforeCreate: function *() {
        //Set the password without triggering the change.
        this.__data.password = require('../lib/utils').hashPassword(this.password);

        //Create a unique unsubscribe guid for this user.  This will be used in the future to unsubscribe them from emails.
        this.unsubscribe = Models.utils.guid(24);
      },
      beforeSave: function *() {
        //Check to see if someone is crazy enough to try to modify a system account
        if (this._id && (this._id.equals(Models.anonymousUser._id) || this._id.equals(Models.systemUser._id))) {
          throw new Models.errors.SystemAccountError();
        }

        //Hash that password
        if (this.hasChanged('password') && this.password) {
          this.password = require('../lib/utils').hashPassword(this.password);
        }

        //Make sure all emails are lower case!
        //DEFECT: https://trello.com/c/EYkfUJGV/418-general-email-addressses-with-a-whitespace-can-cause-a-user-not-to-be-able-to-login-or-reset-password
        // Also make sure all emails are trimmed.
        if (this.login) {
          for (var i=0; i<this.login.length; i++) {
            this.login[i].email = this.login[i].email.toLowerCase().trim();
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
          ArrayMaxLength: 128
        },
        secure: {
          update: ['System']
        }
      },
      login: {
        type: Models.structures.UserLogin,
        array: true,
        validators: {
          Required: true,
          ArrayMaxLength: 5,
          ArrayMinLength: 1
        },
        secure: {
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
      unsubscribe: {
        type: String,
        secure: {
          read: ['System'],
          update: ['System']
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
      flavour: {
        type: String
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
        type: Models.Structure,
        secure: {
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
        array: true,
        secure: {
          update: ['System', 'Admin', 'Owner']
        }
      },
      OAuth: {
        type: Models.structures.OAuth,
        array: true,
        secure: {
          update: ['System']
        }
      }
    },
    secure: {
      read: ['System', 'Admin', 'User', 'Owner'],
      create: ['System', 'Admin'],
      update: ['System', 'Admin', 'Owner'],
      remove: ['System', 'Admin']
    }
  });
};