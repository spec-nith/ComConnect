# ✨ **COMCONNECT** ✨  
## 🏆 *An Event Organizing Application*  

## 📌 Project Overview
This is a **production-grade, scalable, real-time workspace collaboration and event tracking system** built with **microservices architecture**, **MongoDB, Redis, Kafka, WebSockets, Firebase**, and **Docker**.

### **Key Features**
- ✅ **Real-time chat** via WebSockets (Socket.IO)
- ✅ **Workspace management** with granular roles
- ✅ **Task tracking** integrated with MongoDB
- ✅ **Push notifications** via Firebase Cloud Messaging
- ✅ **Event streaming** with Kafka
- ✅ **Microservices architecture** with API Gateway
- ✅ **Production-ready** with observability, rate limiting, and circuit breakers

## 🚀 Live Demo  
🔗 **Check out the deployed application here:** [Com Connect](https://com-connect.vercel.app/)  

🔥 Experience real-time collaboration, seamless chat, and powerful workspace management right in your browser!  

---

## 🏗 Architecture

### **Microservices Architecture**
The application is built as a **production-grade microservices architecture** with the following services:

| Service | Port | Description |
|---------|------|-------------|
| **API Gateway** | 8080 | Nginx-based gateway for routing and load balancing |
| **User Service** | 5001 | Authentication, user management, JWT tokens |
| **Chat Service** | 5002 | Chat creation, group management |
| **Message Service** | 5003 | Real-time messaging via Socket.IO |
| **Workspace Service** | 5004 | Workspace and role management |
| **Task Service** | 5005 | Task allocation and tracking |
| **Notification Service** | 5006 | Push notifications via FCM, Kafka, Redis |

### **Infrastructure Services**
- **MongoDB**: Primary database for all services
- **Redis**: Caching and FCM token storage
- **Kafka + Zookeeper**: Event streaming and async notifications
- **Prometheus**: Metrics collection
- **Jaeger**: Distributed tracing
- **Grafana**: Metrics visualization

### **System Architecture Diagram**
```
                           ┌──────────────────────────┐
                           │     Frontend (React)     │
                           └──────────┬──────────────┘
                                      │
                           ┌──────────▼──────────────┐
                           │    API Gateway (Nginx)   │
                           └──────────┬──────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                               │
   ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
   │  User  │  │  Chat   │  │ Message │  │Workspace│  │  Task   │
   │Service │  │Service  │  │ Service │  │ Service │  │ Service │
   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │            │            │
        └────────────┴────────────┴────────────┴────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ MongoDB │       │  Redis  │       │  Kafka  │
   └─────────┘       └─────────┘       └─────────┘
        │                  │                  │
   ┌────▼──────────────────┴──────────────────▼────┐
   │  Prometheus  │  Jaeger  │  Grafana  │  Firebase │
   └─────────────────────────────────────────────────┘
```

---

## 🎯 Production Features

### **1. API Versioning**
- Support for multiple API versions (v1, v2, etc.)
- Version detection via URL path, header, or query parameter
- Backward compatible (defaults to v1)
- Deprecation header support

**Usage:**
```bash
# URL path
GET /api/v1/user/login

# Header
GET /api/user/login
Headers: { 'X-API-Version': 'v1' }

# Query parameter
GET /api/user/login?version=v1
```

### **2. Rate Limiting**
- Global rate limiting: 100 requests/15 minutes
- Authentication endpoints: 5 requests/15 minutes
- Registration endpoints: 3 requests/hour
- Applied to all services

### **3. Request ID Middleware**
- Unique request ID (UUID) for every request
- Propagated across all services
- Enables distributed tracing and debugging
- Available in response headers: `X-Request-ID`

### **4. Circuit Breaker**
- Automatic failure detection
- Prevents cascading failures
- Automatic recovery
- Used for inter-service communication

### **5. Metrics Collection (Prometheus)**
- HTTP metrics: duration, count, errors, active connections
- Database metrics: operation duration
- System metrics: CPU, memory, heap, event loop lag
- Exposed at `/metrics` on each service

**Access:** http://localhost:9090

### **6. Distributed Tracing (Jaeger)**
- Automatic instrumentation for HTTP, Express, MongoDB
- End-to-end request tracking
- Request ID correlation
- Error tracking in spans

**Access:** http://localhost:16686

### **7. Production Dockerfiles**
- Multi-stage builds for optimized images
- Production dependencies only
- Non-root user execution
- Health checks included

### **8. API Gateway**
- Nginx-based gateway
- Centralized routing
- Rate limiting at gateway level
- WebSocket support for Socket.IO
- Version-aware routing

---

## ⚙️ Tech Stack

| Component | Technology Used |
|-----------|----------------|
| **Frontend** | React, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB |
| **Cache** | Redis |
| **Message Queue** | Kafka + Zookeeper |
| **Real-Time** | Socket.IO (WebSockets) |
| **Notifications** | Firebase Cloud Messaging |
| **API Gateway** | Nginx |
| **Containerization** | Docker, Docker Compose |
| **Observability** | Prometheus, Jaeger, Grafana |
| **Authentication** | JWT (JSON Web Tokens) |

---

## 🚀 Getting Started

### **Prerequisites**
- Docker and Docker Compose
- Node.js 18+ (for local development)
- npm or yarn

### **Quick Start with Docker**

```bash
# Clone the repository
git clone <repository-url>
cd ComConnect

# Start all services
docker-compose up --build

# Services will be available at:
# - Frontend: http://localhost:3000
# - API Gateway: http://localhost:8080
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001 (admin/admin)
# - Jaeger: http://localhost:16686
```

### **Local Development**

```bash
# Install dependencies
cd frontend && npm install
cd ../backend/services/user-service && npm install
# Repeat for other services...

# Start services individually
# Frontend
cd frontend && npm start

# Backend services (from each service directory)
npm run dev
```

### **Environment Variables**

Create a `.env` file in the root directory:

```env
# Database
MONGODB_URI=mongodb://mongodb:27017/comconnect
REDIS_HOST=redis
REDIS_PORT=6379

# Kafka
KAFKA_BROKER=kafka:9092

# Services
USER_SERVICE_PORT=5001
CHAT_SERVICE_PORT=5002
MESSAGE_SERVICE_PORT=5003
WORKSPACE_SERVICE_PORT=5004
TASK_SERVICE_PORT=5005
NOTIFICATION_SERVICE_PORT=5006

# JWT
JWT_SECRET=your-secret-key

# CORS
CORS_ORIGIN=http://localhost:3000

# Firebase (for notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Observability
JAEGER_ENDPOINT=http://jaeger:4318/v1/traces
```

---

## 📊 Observability

### **Metrics (Prometheus)**
- **Endpoint**: http://localhost:9090
- **Service Metrics**: Each service exposes `/metrics`
- **Query Examples**:
  ```promql
  # Request rate
  rate(http_requests_total[5m])
  
  # Error rate
  rate(http_request_errors_total[5m])
  
  # P95 latency
  histogram_quantile(0.95, http_request_duration_seconds_bucket)
  ```

### **Tracing (Jaeger)**
- **UI**: http://localhost:16686
- **Search by**: Service name, operation, request ID, API version
- **Features**: End-to-end request tracking, error correlation

### **Dashboards (Grafana)**
- **UI**: http://localhost:3001
- **Credentials**: admin/admin
- **Datasource**: Prometheus (auto-configured)

---

## 🔌 API Endpoints

### **User Service**
- `POST /api/user` - Register user
- `POST /api/user/login` - Login
- `GET /api/user` - Get all users (protected)
- `GET /api/version` - API version info
- `GET /metrics` - Prometheus metrics

### **Chat Service**
- `POST /api/chat` - Create/access chat
- `GET /api/chat/workspace/:workspaceId/chats` - Get workspace chats
- `POST /api/chat/group` - Create group chat
- `PUT /api/chat/rename` - Rename group
- `GET /api/version` - API version info
- `GET /metrics` - Prometheus metrics

### **Message Service**
- `GET /api/message/:chatId` - Get messages
- `POST /api/message` - Send message
- `WebSocket: /socket.io/` - Real-time messaging
- `GET /api/version` - API version info
- `GET /metrics` - Prometheus metrics

### **Workspace Service**
- `POST /api/workspace` - Create workspace
- `GET /api/workspace/user` - Get user workspaces
- `POST /api/workspace/:id/role` - Add role
- `GET /api/workspace/:id/roles` - Get roles
- `GET /api/version` - API version info
- `GET /metrics` - Prometheus metrics

### **Task Service**
- `POST /api/tasks/allocate` - Allocate task
- `GET /api/tasks/my-tasks` - Get my tasks
- `GET /api/tasks/allocated-tasks` - Get allocated tasks
- `PATCH /api/tasks/update-status` - Update task status
- `GET /api/version` - API version info
- `GET /metrics` - Prometheus metrics

### **Notification Service**
- `POST /api/notification/send` - Send notification
- `POST /api/notification/token` - Update FCM token
- `GET /api/version` - API version info
- `GET /metrics` - Prometheus metrics

**Note:** All endpoints support versioning via `/api/v1/...` or `X-API-Version` header.

---

## 🏛 Database Design

The system uses **MongoDB** for all data storage with the following collections:

- **users**: User accounts and authentication
- **chats**: Chat rooms and group chats
- **messages**: Chat messages
- **workspaces**: Workspace management
- **tasks**: Task allocation and tracking

---

## 📡 WebSocket Implementation

### **Real-Time Messaging**
```javascript
// Client connection
const socket = io('http://localhost:8080');

// Setup user
socket.emit('setup', userData);

// Join chat
socket.emit('join chat', chatId);

// Send message
socket.emit('new message', messageData);

// Receive message
socket.on('message recieved', (message) => {
  // Handle message
});
```

---

## 🐳 Docker Services

The `docker-compose.yml` includes:

- **6 Microservices**: user, chat, message, workspace, task, notification
- **API Gateway**: Nginx
- **MongoDB**: Database
- **Redis**: Cache
- **Kafka + Zookeeper**: Message queue
- **Prometheus**: Metrics
- **Jaeger**: Tracing
- **Grafana**: Dashboards
- **Frontend**: React app

All services include:
- Health checks
- Restart policies
- Resource limits
- Graceful shutdown

---

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- CORS configuration
- Request ID tracking for security auditing
- Non-root user execution in containers

---

## 📝 Development

### **Project Structure**
```
ComConnect/
├── frontend/              # React frontend
├── backend/
│   └── services/
│       ├── user-service/
│       ├── chat-service/
│       ├── message-service/
│       ├── workspace-service/
│       ├── task-service/
│       ├── notification-service/
│       ├── api-gateway/   # Nginx configuration
│       └── shared/        # Shared middleware and utilities
├── prometheus/            # Prometheus configuration
├── grafana/              # Grafana configuration
└── docker-compose.yml     # Docker orchestration
```

### **Running Tests**
```bash
# Run tests for a specific service
cd backend/services/user-service
npm test
```

---

## 📄 License
This project is licensed under **MIT License**.

---

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📧 Contact
For questions or support, please open an issue on GitHub.
