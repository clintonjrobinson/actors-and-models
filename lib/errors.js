"use strict";

function NotLoggedInError(path) {
  this.name = "NotLoggedInError";
  this.message = "You need to login to perform this action.";
  this.path = path;
  this.status = 401;
}
NotLoggedInError.prototype = Error.prototype;
exports.NotLoggedInError = NotLoggedInError;


function NotAuthorizedError(message) {
  this.name = "NotAuthorizedError";
  this.message = (message || "You are not authorized to perform this action.");
  this.status = 401;
  this.expose = true;
}
NotAuthorizedError.prototype = Error.prototype;
exports.NotAuthorizedError = NotAuthorizedError;

function InvalidMethodError(message) {
  this.name = "InvalidMethodError";
  this.message = (message || "Invalid HTTP method attempted.");
  this.status = 405;
  this.expose = true;
}
InvalidMethodError.prototype = Error.prototype;
exports.InvalidMethodError = InvalidMethodError;


function NotFoundError(message) {
  this.name = "NotFoundError";
  this.message = (message || "This resource was not found.");
  this.status = 404;
  this.expose = true;
}
NotFoundError.prototype = Error.prototype;
exports.NotFoundError = NotFoundError;


function MissingParametersError(params) {
  this.name = "MissingParametersError";
  this.message = "You are missing parameters: " + ([].concat(params, []).join(', '));
  this.status = 406;
  this.data = params;
  this.expose = true;
}
MissingParametersError.prototype = Error.prototype;
exports.MissingParametersError = MissingParametersError;

function SecurityDocRequiredError(message) {
  this.name = "SecurityDocRequiredError";
  this.message = ("You have not supplied the required security doc." || message);
  this.status = 401;
  this.expose = true;
}
SecurityDocRequiredError.prototype = Error.prototype;
exports.SecurityDocRequiredError = SecurityDocRequiredError;


function ValidationError(validation) {
  this.name = "ValidationError";
  this.message = "Validation failed.";
  this.status = 400;
  this.data = validation;
  this.expose = true;
}
ValidationError.prototype = Error.prototype;
exports.ValidationError = ValidationError;
