/**
 * Version Info Middleware
 * Adds version information to response headers
 */

const { getVersionInfo, addDeprecationHeaders } = require('../config/apiVersions');

const versionInfoMiddleware = (req, res, next) => {
  // Add deprecation warnings if applicable
  addDeprecationHeaders(req, res);
  
  // Add version info to response
  const versionInfo = getVersionInfo(req.apiVersion);
  res.setHeader('X-API-Version', versionInfo.version);
  res.setHeader('X-API-Supported-Versions', ['v1'].join(', '));
  
  if (versionInfo.isDeprecated) {
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('Warning', `299 - "Version ${versionInfo.version} is deprecated"`);
  }
  
  next();
};

module.exports = versionInfoMiddleware;

