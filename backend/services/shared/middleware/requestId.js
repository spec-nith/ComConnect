const { v4: uuidv4 } = require('uuid');

/**
 * Request ID Middleware
 * Adds a unique request ID to each request for distributed tracing
 */
const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.locals.requestId = requestId;
  next();
};

module.exports = requestIdMiddleware;

