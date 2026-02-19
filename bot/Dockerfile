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

# Python + Tesseract + OpenCV via apk (évite la compilation depuis sources)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-numpy \
    py3-pillow \
    py3-opencv \
    tesseract-ocr \
    tesseract-ocr-data-fra \
    tesseract-ocr-data-eng \
    ffmpeg

# pytesseract uniquement via pip (léger, pas de compilation)
RUN pip install --break-system-packages --no-cache-dir pytesseract==0.3.10

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Copier le worker Python
COPY src/lunaclip-worker ./dist/lunaclip-worker

CMD ["node", "dist/index.js"]