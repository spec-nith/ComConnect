const { v4: uuidv4 } = require('uuid');

/**
 * Request ID Middleware
 * Adds a unique request ID to each request for distributed tracing
 */
const requestIdMiddleware = (req, res, next) => {
  // Get request ID from header or generate new one
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Add to request object
  req.id = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Add to response locals for logging
  res.locals.requestId = requestId;
  
  next();
};

module.exports = requestIdMiddleware;

