# backend/Dockerfile
FROM node:18-bookworm-slim
WORKDIR /app

# tools sharp may need
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# install ALL deps (including dev, so tsx is present)
COPY package*.json ./
RUN npm install

# app source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# start: uses your package.json "start" (likely tsx)
CMD ["npm","start"]
