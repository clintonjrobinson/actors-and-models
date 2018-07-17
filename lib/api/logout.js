exports = module.exports = function(Models) {
  return function *() {
    this.session = null;

    yield Models.auth.setup();

    this.body = {success: true};
  }
};