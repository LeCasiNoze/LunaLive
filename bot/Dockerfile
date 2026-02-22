# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# System deps: Python + Tesseract + FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Python deps (ultralytics + torch + ocr deps)
# (tu peux aussi mettre un requirements.txt, mais là je fais direct pour aller vite)
RUN python3 -m pip install --no-cache-dir --upgrade pip \
 && python3 -m pip install --no-cache-dir \
    numpy==1.26.4 \
    Pillow==10.3.0 \
    pytesseract==0.3.10 \
    opencv-python-headless==4.10.0.84 \
    ultralytics==8.4.14 \
    torch==2.5.1

# Node deps prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App
COPY --from=build /app/dist ./dist
COPY src/lunaclip-worker ./dist/lunaclip-worker

# (optionnel mais utile) check au build
RUN python3 -c "import ultralytics, torch; print('OK', ultralytics.__version__, torch.__version__)"

CMD ["node", "dist/index.js"]