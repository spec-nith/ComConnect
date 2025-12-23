/**
 * API Versioning Middleware
 * Supports versioning via:
 * 1. URL path: /api/v1/user, /api/v2/user
 * 2. Header: X-API-Version: v1
 * 3. Query parameter: ?version=v1
 * 
 * Defaults to v1 if no version specified
 */

const apiVersioning = (req, res, next) => {
  // Extract version from URL path
  const pathVersion = req.path.match(/^\/api\/v(\d+)\//);
  
  // Extract version from header
  const headerVersion = req.headers['x-api-version'];
  
  // Extract version from query parameter
  const queryVersion = req.query.version;
  
  // Determine which version to use (priority: path > header > query > default)
  let version = 'v1'; // Default version
  
  if (pathVersion) {
    version = `v${pathVersion[1]}`;
    // Remove version from path for routing
    req.url = req.url.replace(`/api/${version}`, '/api');
    req.path = req.path.replace(`/api/${version}`, '/api');
  } else if (headerVersion) {
    version = headerVersion.startsWith('v') ? headerVersion : `v${headerVersion}`;
  } else if (queryVersion) {
    version = queryVersion.startsWith('v') ? queryVersion : `v${queryVersion}`;
  }
  
  // Store version in request object
  req.apiVersion = version;
  res.locals.apiVersion = version;
  
  // Add version to response headers
  res.setHeader('X-API-Version', version);
  
  next();
};

/**
 * Version router helper
 * Creates versioned routes
 */
const createVersionedRouter = (versions) => {
  return (req, res, next) => {
    const version = req.apiVersion || 'v1';
    const handler = versions[version];
    
    if (handler) {
      return handler(req, res, next);
    } else {
      // Version not found, return 404
      return res.status(404).json({
        error: 'API version not found',
        requestedVersion: version,
        availableVersions: Object.keys(versions),
        message: `Version ${version} is not available. Available versions: ${Object.keys(versions).join(', ')}`
      });
    }
  };
};

/**
 * Version validator
 * Validates that the requested version is supported
 */
const validateVersion = (supportedVersions) => {
  return (req, res, next) => {
    const version = req.apiVersion || 'v1';
    
    if (supportedVersions.includes(version)) {
      next();
    } else {
      res.status(400).json({
        error: 'Unsupported API version',
        requestedVersion: version,
        supportedVersions: supportedVersions,
        message: `Version ${version} is not supported. Supported versions: ${supportedVersions.join(', ')}`
      });
    }
  };
};

module.exports = {
  apiVersioning,
  createVersionedRouter,
  validateVersion
};

