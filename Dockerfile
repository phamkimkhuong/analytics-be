# Stage 1: Build TypeScript source code
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for tsc)
RUN npm ci

# Copy source code
COPY src/ ./src

# Compile TypeScript
RUN npm run build

# Stage 2: Final runner image
FROM node:20-alpine

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy static frontend files and configuration
COPY web/ ./web
COPY config/ ./config

# Create storage directories for mounting persistent volumes (snapshots & reports)
RUN mkdir -p snapshots reports

# Default environment variables
ENV PORT=4627
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 4627

# Command to start the web portal
CMD ["node", "dist/web/server.js"]
