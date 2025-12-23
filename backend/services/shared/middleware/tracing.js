/**
 * Distributed Tracing Middleware using OpenTelemetry
 * Integrates with Jaeger for distributed tracing
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http');
const { trace, context, propagation } = require('@opentelemetry/api');

let tracer;
let sdk;
let isInitialized = false;

/**
 * Initialize tracing for a service
 */
const initializeTracing = (serviceName, serviceVersion = '1.0.0') => {
  if (isInitialized) {
    return tracer;
  }

  // Only initialize if not already done (singleton pattern)
  if (sdk) {
    tracer = trace.getTracer(serviceName, serviceVersion);
    return tracer;
  }

  // Configure OTLP exporter for Jaeger
  const traceExporter = new OTLPTraceExporter({
    url: process.env.JAEGER_ENDPOINT || 'http://jaeger:4318/v1/traces',
    headers: {},
    timeoutMillis: 10000
  });

  // Initialize SDK
  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations({
      // Disable fs instrumentation to reduce noise
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    })],
  });

  // Start the SDK
  sdk.start();

  tracer = trace.getTracer(serviceName, serviceVersion);
  isInitialized = true;

  console.log(`✅ Tracing initialized for ${serviceName}`);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });

  return tracer;
};

/**
 * Tracing middleware
 * Note: Express instrumentation handles most of this automatically
 * This middleware adds custom attributes
 */
const tracingMiddleware = (serviceName) => {
  // Initialize if not already done
  if (!isInitialized) {
    initializeTracing(serviceName);
  }

  return (req, res, next) => {
    // Get active span (created by Express instrumentation)
    const span = trace.getActiveSpan();
    
    if (span) {
      // Add custom attributes
      span.setAttribute('service.name', serviceName);
      
      // Add request ID to span
      if (req.id) {
        span.setAttribute('request.id', req.id);
      }

      // Add API version to span
      if (req.apiVersion) {
        span.setAttribute('api.version', req.apiVersion);
      }

      // Store span in request for manual instrumentation
      req.span = span;

      // Update span status on error
      const originalSend = res.send;
      res.send = function(data) {
        if (res.statusCode >= 400) {
          span.setStatus({
            code: res.statusCode >= 500 ? 2 : 1, // ERROR or UNSET
            message: res.statusMessage,
          });
        }
        return originalSend.call(this, data);
      };
    }
    
    next();
  };
};

/**
 * Create a child span for operations
 */
const createSpan = (name, parentSpan = null) => {
  const span = parentSpan 
    ? tracer.startSpan(name, { parent: parentSpan })
    : tracer.startSpan(name);
  return span;
};

/**
 * Get current span from context
 */
const getCurrentSpan = () => {
  return trace.getActiveSpan() || null;
};

/**
 * Add attributes to current span
 */
const addSpanAttribute = (key, value) => {
  const span = getCurrentSpan();
  if (span) {
    try {
      span.setAttribute(key, value);
    } catch (error) {
      // Silently fail if span is not available
    }
  }
};

/**
 * Add event to current span
 */
const addSpanEvent = (name, attributes = {}) => {
  const span = getCurrentSpan();
  if (span) {
    try {
      span.addEvent(name, attributes);
    } catch (error) {
      // Silently fail if span is not available
    }
  }
};

/**
 * Record error in span
 */
const recordSpanError = (error) => {
  const span = getCurrentSpan();
  if (span) {
    try {
      span.recordException(error);
      span.setStatus({
        code: 2, // ERROR
        message: error.message,
      });
    } catch (err) {
      // Silently fail if span is not available
    }
  }
};

module.exports = {
  initializeTracing,
  tracingMiddleware,
  createSpan,
  getCurrentSpan,
  addSpanAttribute,
  addSpanEvent,
  recordSpanError,
  getTracer: () => tracer,
  propagation,
  context,
  trace
};

