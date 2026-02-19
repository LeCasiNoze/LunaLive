# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Python + Tesseract + dépendances OpenCV
RUN apk add --no-cache \
    python3 \
    py3-pip \
    tesseract-ocr \
    tesseract-ocr-data-fra \
    tesseract-ocr-data-eng \
    libstdc++ \
    openblas \
    ffmpeg

# Dépendances Python pour LunaClip
COPY src/lunaclip-worker/requirements.txt /tmp/requirements.txt
RUN pip install --break-system-packages --no-cache-dir -r /tmp/requirements.txt

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Copier le worker Python dans le bon dossier
COPY src/lunaclip-worker ./dist/lunaclip-worker

CMD ["node", "dist/index.js"]