/**
 * API Version Configuration
 * Centralized version management for all services
 */

const API_VERSIONS = {
  // Current supported versions
  SUPPORTED_VERSIONS: ['v1'],
  
  // Default version
  DEFAULT_VERSION: 'v1',
  
  // Version deprecation dates
  DEPRECATION_DATES: {
    // v1: '2025-12-31' // Example: v1 will be deprecated on this date
  },
  
  // Version sunset dates (when version will be removed)
  SUNSET_DATES: {
    // v1: '2026-12-31' // Example: v1 will be sunset on this date
  }
};

/**
 * Get version info
 */
const getVersionInfo = (version = API_VERSIONS.DEFAULT_VERSION) => {
  const isDeprecated = API_VERSIONS.DEPRECATION_DATES[version] && 
    new Date(API_VERSIONS.DEPRECATION_DATES[version]) < new Date();
  const isSunset = API_VERSIONS.SUNSET_DATES[version] && 
    new Date(API_VERSIONS.SUNSET_DATES[version]) < new Date();
  
  return {
    version,
    isSupported: API_VERSIONS.SUPPORTED_VERSIONS.includes(version),
    isDeprecated,
    isSunset,
    deprecationDate: API_VERSIONS.DEPRECATION_DATES[version] || null,
    sunsetDate: API_VERSIONS.SUNSET_DATES[version] || null
  };
};

/**
 * Add deprecation headers to response
 */
const addDeprecationHeaders = (req, res) => {
  const versionInfo = getVersionInfo(req.apiVersion);
  
  if (versionInfo.isDeprecated && !versionInfo.isSunset) {
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Date', versionInfo.deprecationDate);
    res.setHeader('X-API-Sunset-Date', versionInfo.sunsetDate || 'TBD');
  }
  
  if (versionInfo.isSunset) {
    res.status(410).json({
      error: 'API version has been sunset',
      version: versionInfo.version,
      sunsetDate: versionInfo.sunsetDate,
      message: `Version ${versionInfo.version} is no longer available. Please upgrade to a supported version.`
    });
    return false;
  }
  
  return true;
};

module.exports = {
  API_VERSIONS,
  getVersionInfo,
  addDeprecationHeaders
};

