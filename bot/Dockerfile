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


FROM node:22-bookworm-slim
WORKDIR /srv/lunalive-bot
ENV NODE_ENV=production

COPY --from=build /repo/bot/package.json ./
COPY --from=build /repo/bot/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /repo/bot/dist ./dist

CMD ["node", "/srv/lunalive-bot/dist/index.js"]