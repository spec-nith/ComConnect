const axios = require('axios');

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures in inter-service communication
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
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
      // Try to transition to HALF_OPEN
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

// Create circuit breaker instances for different services
const circuitBreakers = {
  notificationService: new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000
  })
};

/**
 * Make HTTP request with circuit breaker protection
 */
const makeRequest = async (url, options = {}, serviceName = 'default') => {
  const breaker = circuitBreakers[serviceName] || new CircuitBreaker();
  
  return breaker.execute(async () => {
    try {
      const response = await axios({
        url,
        method: options.method || 'GET',
        data: options.data,
        headers: options.headers,
        timeout: options.timeout || 10000
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        // Server responded with error
        throw new Error(`Service error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        // Request made but no response
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

