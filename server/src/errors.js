class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function assert(condition, status, code, message, details) {
  if (!condition) throw new ApiError(status, code, message, details);
}

module.exports = {ApiError, assert};
