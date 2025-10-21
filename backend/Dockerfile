FROM node:18-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ vips-dev libc6-compat
COPY package*.json ./
# allow postinstall scripts (sharp needs them)
RUN npm ci

FROM node:18-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BASE_API_URL
ENV BASE_API_URL=${BASE_API_URL}
RUN npm run build

FROM node:18-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# copy runtime bits
COPY --from=build /app/dist ./dist
COPY package*.json ./
# install prod deps (runs sharp postinstall against musl)
RUN apk add --no-cache vips-dev libc6-compat \
  && npm ci --omit=dev \
  && npm cache clean --force
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 3000
CMD ["node","dist/server.js"]
