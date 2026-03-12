# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY ../shared ./shared
RUN npm run build


# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Node deps prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App
COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]