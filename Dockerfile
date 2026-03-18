# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install client dependencies
COPY src/client/package.json src/client/package-lock.json* src/client/
RUN cd src/client && npm ci

# Copy source
COPY tsconfig.json ./
COPY src/server/ src/server/
COPY src/client/ src/client/

# Build server (TypeScript -> dist/server/) and client (Vite -> dist/client/)
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "--max-old-space-size=768", "dist/server/index.js"]
