"use strict";

function NotAuthorizedError(message) {
  this.name = "NotAuthorizedError";
  this.message = (message || "You are not authorized to perform this action.");
  this.status = 401;
}
NotAuthorizedError.prototype = Error.prototype;
exports.NotAuthorizedError = NotAuthorizedError;


function NotFoundError(message) {
  this.name = "NotFoundError";
  this.message = (message || "This resource was not found.");
  this.status = 404;
}
NotFoundError.prototype = Error.prototype;
exports.NotFoundError = NotFoundError;


function MissingParametersError(params) {
  this.name = "MissingParametersError";
  this.message = "You are missing parameters: " + ([].concat(params, []).join(', '));
  this.status = 406;
  this.data = params;
}
MissingParametersError.prototype = Error.prototype;
exports.MissingParametersError = MissingParametersError;


function ValidationError(validation) {
  this.name = "ValidationError";
  this.message = "Validation failed.";
  this.status = 400;
  this.data = validation;
}
ValidationError.prototype = Error.prototype;
exports.ValidationError = ValidationError;
