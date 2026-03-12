# ---- build ----
FROM node:22-alpine AS build
WORKDIR /repo

COPY bot/package.json bot/package-lock.json ./bot/
COPY bot/tsconfig.json ./bot/
COPY bot/src ./bot/src
COPY shared/src ./shared/src

WORKDIR /repo/bot
RUN npm ci
RUN npm run build

# DEBUG build stage
RUN pwd
RUN find /repo/bot/dist -maxdepth 5 -type f | sort


# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Node deps prod
COPY bot/package.json bot/package-lock.json ./
RUN npm ci --omit=dev

# App
COPY --from=build /repo/bot/dist ./dist
COPY --from=build /repo/bot/node_modules ./node_modules

# DEBUG runtime stage
RUN pwd
RUN find /app -maxdepth 5 -type f | sort
RUN echo "CMD final: [\"node\", \"dist/index.js\"]"

CMD ["node", "dist/index.js"]