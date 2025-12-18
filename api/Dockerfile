FROM node:22-bookworm-slim

WORKDIR /app

# ffmpeg (stable) + certs
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# deps
COPY package*.json ./
RUN npm ci

# build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
