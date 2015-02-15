"use strict";

function NotAuthorizedError(message) {
  this.name = "NotAuthorizedError";
  this.message = (message || "You are not authorized to perform this action.");
  this.code = 401;
}
NotAuthorizedError.prototype = Error.prototype;
exports.NotAuthorizedError = NotAuthorizedError;

function NotFoundError(message) {
  this.name = "NotFoundError";
  this.message = (message || "This resource was not found.");
  this.code = 404;
}
NotFoundError.prototype = Error.prototype;
exports.NotFoundError = NotFoundError;
