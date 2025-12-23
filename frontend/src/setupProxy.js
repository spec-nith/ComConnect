const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Only proxy API requests, not Socket.IO
  if (!process.env.REACT_APP_USE_PROD_API) {
    const target = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:8080';
    
    console.log('Proxy Configuration:');
    console.log('- Target:', target);
    console.log('- Proxying: /api only (Socket.IO connects directly)');
    
    // Only proxy /api, let Socket.IO connect directly
    app.use(
      '/api',
      createProxyMiddleware({
        target: target,
        changeOrigin: true,
        logLevel: 'warn',
        onError: (err, req, res) => {
          console.error('Proxy Error:', err.message);
        }
      })
    );
  }
};