# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY bot/package.json bot/package-lock.json ./
COPY bot/tsconfig.json ./
COPY bot/src ./src
COPY shared/src ./shared/src
RUN npm ci

RUN npm run build


# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Node deps prod
COPY bot/package.json bot/package-lock.json ./
RUN npm ci --omit=dev

# App
COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]