# Production Stage
FROM node:20-alpine AS builder

ARG CACHE_BUST=default

WORKDIR /usr/src/app

# Native build deps for optional native modules (e.g. isolated-vm). Harmless if unused.
RUN apk add --no-cache python3 make g++ linux-headers

COPY package*.json ./

RUN npm ci

COPY tsconfig*.json nest-cli.json ./

COPY src ./src

RUN echo "Building with CACHE_BUST=${CACHE_BUST}" && npm run build

FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

# Native build deps for optional native modules (e.g. isolated-vm). Harmless if unused.
RUN apk add --no-cache python3 make g++ linux-headers

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/main.js"]
