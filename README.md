# News Feed Backend API

A professional, secure, and scalable Node.js backend API for a news feed application built with Express.js and MongoDB.

## 🚀 Features

### Security First

- **Comprehensive Security Middleware**: Helmet, CORS, XSS protection, NoSQL injection prevention
- **Rate Limiting**: Multiple rate limiters for different endpoints
- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Account Security**: Account lockout after failed attempts, password complexity validation
- **Input Validation**: Express-validator for request validation
- **Security Logging**: Suspicious activity detection and logging

### Professional Architecture

- **Clean Code Structure**: Organized folder structure with separation of concerns
- **Error Handling**: Centralized error handling with custom error classes
- **Async Error Handling**: Proper async/await error catching
- **Database Connection**: Singleton pattern with connection pooling
- **Environment Configuration**: Centralized config management with validation

### API Features

- **User Management**: Registration, login, profile management, role-based access
- **Post Management**: CRUD operations with advanced features
- **Content Moderation**: Admin/moderator controls for content management
- **Search & Filtering**: Full-text search and category filtering
- **Performance Optimized**: Database indexing and query optimization

## 📁 Project Structure

```
src/
├── config/
│   ├── database.js          # Database connection with singleton pattern
│   └── index.js             # Centralized configuration management
├── controllers/
│   ├── authController.js    # Authentication logic
│   ├── userController.js    # User management
│   └── postController.js    # Post management
├── middleware/
│   ├── auth.js              # Authentication & authorization middleware
│   ├── security.js          # Security middleware (rate limiting, etc.)
│   └── errorHandler.js      # Global error handling
├── models/
│   ├── User.js              # User schema with security features
│   ├── Post.js              # Post schema with SEO and content features
│   ├── Comment.js           # Comment schema with nesting support
│   └── Promotion.js         # Advertisement/promotion schema
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── users.js             # User management routes
│   └── posts.js             # Post management routes
├── utils/
│   ├── appError.js          # Custom error class
│   ├── catchAsync.js        # Async error wrapper
│   └── apiResponse.js       # Standardized API responses
└── app.js                   # Main application file
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment Setup**
   Create a `.env` file in the root directory:

   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/news_feed
   JWT_SECRET=your-super-secure-jwt-secret-key
   JWT_EXPIRES_IN=7d
   JWT_COOKIE_EXPIRES_IN=7
   BCRYPT_SALT_ROUNDS=12

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # Email Configuration (Optional)
   EMAIL_FROM=noreply@yourapp.com
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password

   # Cloudinary (Optional)
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

3. **Start the application**

   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 🔐 Security Features

### Authentication & Authorization

- JWT-based authentication with secure HTTP-only cookies
- Role-based access control (Admin, Moderator, Author, Viewer)
- Account lockout after 5 failed login attempts
- Password complexity requirements
- Email verification support

### Security Middleware

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing protection
- **Rate Limiting**: Prevents abuse with multiple rate limiters
- **XSS Protection**: Cross-site scripting prevention
- **NoSQL Injection**: MongoDB injection prevention
- **HPP**: HTTP parameter pollution protection

### Data Protection

- Password hashing with bcrypt (12 rounds)
- Input sanitization and validation
- Secure cookie configuration
- Environment variable validation

## 📚 API Documentation

### Authentication Endpoints

```
POST /api/v1/auth/register     # User registration
POST /api/v1/auth/login        # User login
POST /api/v1/auth/logout       # User logout
GET  /api/v1/auth/me           # Get current user
PATCH /api/v1/auth/update-me   # Update profile
```

### User Management

```
GET    /api/v1/users           # Get all users (public)
GET    /api/v1/users/:id       # Get user by ID
GET    /api/v1/users/profile/me # Get my profile
PATCH  /api/v1/users/profile/me # Update my profile
```

### Post Management

```
GET    /api/v1/posts           # Get all posts
GET    /api/v1/posts/trending  # Get trending posts
GET    /api/v1/posts/featured  # Get featured posts
GET    /api/v1/posts/:slug     # Get post by slug
POST   /api/v1/posts           # Create post (Auth required)
PATCH  /api/v1/posts/:id       # Update post (Auth required)
DELETE /api/v1/posts/:id       # Delete post (Auth required)
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/news_feed
JWT_SECRET=your-production-jwt-secret
# ... other production configs
```

### Docker Support (Optional)

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 📊 Performance Optimizations

- Database indexing for common queries
- Connection pooling with MongoDB
- Compression middleware for responses
- Efficient pagination implementation
- Query optimization with aggregation pipelines

## 🔧 Development Tools

- **ESLint**: Code linting with custom rules
- **Prettier**: Code formatting
- **Nodemon**: Development auto-restart
- **Jest**: Testing framework
- **Morgan**: HTTP request logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the documentation
- Review the code comments for implementation details

---

**Built with ❤️ using Node.js, Express.js, and MongoDB**
