# API Service

This is a separate API service for the AWS Cognito User Register application.

## Purpose

The API service handles:
- User management endpoints
- Cookie management endpoints
- AWS Cognito integration
- MongoDB database operations

## Structure

```
api-service/
├── src/
│   ├── config/          # Configuration service
│   ├── common/          # Common utilities and schemas
│   ├── mongodb/         # MongoDB connection and schemas
│   ├── users/           # User management endpoints
│   ├── cookies/         # Cookie management endpoints
│   ├── app.module.ts    # Main application module
│   └── main.ts          # Application entry point
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── nest-cli.json        # NestJS CLI configuration
├── Dockerfile           # Container configuration
└── README.md           # This file
```

## Development

### Prerequisites
- Node.js 18+
- pnpm
- Docker (for containerized development)

### Local Development
```bash
cd api-service
pnpm install
pnpm run start:dev
```

### Docker Development
```bash
# From the root directory
docker-compose up api-service
```

## API Endpoints

The service runs on port 3007 and includes the following endpoints:

- `GET /api/users/get-cookies` - Get user cookies
- User management endpoints (from users module)
- Cookie management endpoints (from cookies module)

## Environment Variables

The service uses the same environment variables as the main application:
- `PORT` - Service port (default: 3007)
- `NODE_ENV` - Environment (development/production)
- `MONGODB_URI` - MongoDB connection string
- AWS Cognito configuration variables
- Other application-specific variables 