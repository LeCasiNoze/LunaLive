# ---- build ----
FROM node:22-alpine AS build
WORKDIR /repo/aurix-bot

COPY aurix-bot/package.json aurix-bot/package-lock.json* ./
COPY aurix-bot/tsconfig.json ./
COPY aurix-bot/src ./src

RUN npm install --no-audit --no-fund
RUN npm run build


# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /srv/aurix-bot
ENV NODE_ENV=production

COPY --from=build /repo/aurix-bot/package.json /repo/aurix-bot/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /repo/aurix-bot/dist ./dist
COPY --from=build /repo/aurix-bot/src/migrations ./dist/migrations

CMD ["node", "/srv/aurix-bot/dist/index.js"]
