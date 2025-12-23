/**
 * Prometheus Metrics Middleware
 * Collects metrics for all HTTP requests
 */

const client = require('prom-client');

// Create a Registry to register the metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service']
});

const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type', 'service']
});

const activeConnections = new client.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
  labelNames: ['service']
});

// Database metrics
const dbOperationDuration = new client.Histogram({
  name: 'db_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'collection', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(httpRequestErrors);
register.registerMetric(activeConnections);
register.registerMetric(dbOperationDuration);

/**
 * Metrics middleware
 */
const metricsMiddleware = (serviceName) => {
  return (req, res, next) => {
    const start = Date.now();
    const route = req.route ? req.route.path : req.path;
    
    // Increment active connections
    activeConnections.inc({ service: serviceName });
    
    // Track response
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const statusCode = res.statusCode;
      const method = req.method;
      
      // Record metrics
      httpRequestDuration.observe(
        { method, route, status_code: statusCode, service: serviceName },
        duration
      );
      
      httpRequestTotal.inc({
        method,
        route,
        status_code: statusCode,
        service: serviceName
      });
      
      // Track errors
      if (statusCode >= 400) {
        const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
        httpRequestErrors.inc({
          method,
          route,
          error_type: errorType,
          service: serviceName
        });
      }
      
      // Decrement active connections
      activeConnections.dec({ service: serviceName });
    });
    
    next();
  };
};

/**
 * Get metrics endpoint handler
 */
const getMetrics = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
};

/**
 * Database operation timer
 */
const trackDbOperation = (operation, collection, serviceName) => {
  const end = dbOperationDuration.startTimer({
    operation,
    collection,
    service: serviceName
  });
  return end;
};

module.exports = {
  register,
  metricsMiddleware,
  getMetrics,
  trackDbOperation,
  httpRequestDuration,
  httpRequestTotal,
  httpRequestErrors,
  activeConnections,
  dbOperationDuration
};

