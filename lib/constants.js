const IS_PRODUCTION = exports.IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PROPERTY_API_IDENTIFIER = exports.PROPERTY_API_IDENTIFIER = 'self.';
const API_PREFIX = exports.API_PREFIX = '/api/v1/';

/**
 * Models have some built in functions and properties, because of this, we cannot allow some property
 * names to be used, because they will clash.
 * @type {string[]}
 */
exports.RESERVED_WORDS = [
  //Function names
  'remove',
  'save',
  'validate',
  'refresh',
  'toJSON',
  'toString',
  'clone',
  'hasChanged',
  'currentLanguage',
  //System controlled properties
  '_id',
  '_mg',
  '_created',
  '_createdBy',
  '_updated',
  '_updatedBy',
  //Meta-data properties
  '__data',
  '__language',
  '__changed',
  '__delta',
  '__getter',
  '__setter'
];

exports.RESERVED_ROLES = [
  //The System account.  Essentially God mode.
  'System',
  //An Admin account.
  'Admin',
  //A meta-role, the User id specified in the _owner property of an instance of a model.
  'Owner',
  //A non-logged in user.
  'Anonymous'
];

exports.LANGUAGES = [
  'en',
  'fr',
  'de',
  'es',
  'zh'
];