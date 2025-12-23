const axios = require('axios');
const { trace, context, propagation } = require('@opentelemetry/api');

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 10000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.lastFailureTime = null;
  }

  async execute(serviceCall) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN. Service unavailable.');
      }
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await serviceCall();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        console.log('✅ Circuit breaker CLOSED - Service recovered');
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.error(`❌ Circuit breaker OPEN - Service failed ${this.failureCount} times`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.nextAttempt,
      lastFailureTime: this.lastFailureTime
    };
  }
}

const circuitBreakers = {
  notificationService: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 })
};

const makeRequest = async (url, options = {}, serviceName = 'default') => {
  const breaker = circuitBreakers[serviceName] || new CircuitBreaker();
  
  return breaker.execute(async () => {
    try {
      // Get current span context for trace propagation
      const activeContext = context.active();
      const span = trace.getActiveSpan(activeContext);
      
      // Prepare headers with trace context
      const headers = {
        ...options.headers,
        'X-Request-ID': options.requestId || ''
      };
      
      // Inject trace context into headers
      propagation.inject(activeContext, headers);
      
      const response = await axios({
        url,
        method: options.method || 'GET',
        data: options.data,
        headers,
        timeout: options.timeout || 10000
      });
      
      // Add span attributes if span exists
      if (span) {
        span.setAttribute('http.status_code', response.status);
        span.setAttribute('circuit_breaker.state', breaker.getState().state);
      }
      
      return response.data;
    } catch (error) {
      // Record error in span
      const span = trace.getActiveSpan();
      if (span) {
        span.recordException(error);
        span.setStatus({
          code: 2, // ERROR
          message: error.message
        });
        span.setAttribute('circuit_breaker.state', breaker.getState().state);
      }
      
      if (error.response) {
        throw new Error(`Service error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Service unavailable - no response');
      } else {
        throw error;
      }
    }
  });
};

module.exports = {
  CircuitBreaker,
  circuitBreakers,
  makeRequest
};

