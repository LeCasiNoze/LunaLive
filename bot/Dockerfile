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

# Python + Tesseract (sans OpenCV pour l’instant)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-numpy \
    py3-pillow \
    tesseract-ocr \
    tesseract-ocr-data-fra \
    tesseract-ocr-data-eng \
    ffmpeg \
    gstreamer \
    gst-plugins-base \
    gst-plugins-good \
    gst-plugins-bad \
    gst-plugins-ugly \
    gst-libav
# pytesseract via pip (AVANT py3-opencv)
RUN pip install --break-system-packages --no-cache-dir pytesseract==0.3.10

# Ensuite seulement OpenCV via apk
RUN apk add --no-cache py3-opencv

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY src/lunaclip-worker ./dist/lunaclip-worker

CMD ["node", "dist/index.js"]
