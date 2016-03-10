const NODE_ENV = exports.NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = exports.IS_PRODUCTION = NODE_ENV === 'production';
const APP_ENV = exports.APP_ENV = process.env.APP_ENV || 'dev';
const PROPERTY_API_IDENTIFIER = exports.PROPERTY_API_IDENTIFIER = 'self.';
const API_PREFIX = exports.API_PREFIX = '/api/v1/';

exports.USER_STATUSES = [
  'Disabled',
  'Active',
  'Pending'
];

exports.USER_STATUS = {
  DISABLED: 'Disabled',
  ACTIVE: 'Active',
  PENDING: 'Pending'
};

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
  'setLocale',
  //System controlled properties
  '_id',
  '_mg',
  '_created',
  '_createdBy',
  '_updated',
  '_updatedBy',
  //Meta-data properties
  '__data',
  '__locale',
  '__changed',
  '__delta',
  '__getter',
  '__setter'
];

exports.USER_SECURE_FIELDS = {
  _id: 1,
  groups: 1,
  login: 1,
  status: 1,
  name: 1,
  lastLogin: 1,
  roles: 1,
  settings: 1,
  picture: 1,
  flavour: 1,
  guid2: 1,
  guid3: 1
};

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

exports.GEOJSON_TYPES = ['Point', 'MultiPoint', 'LineString', 'Polygon', 'MultiPolygon'];

exports.PUSH_SERVICES = ['apns', 'bbps', 'gcm'];