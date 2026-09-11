FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    fonts-roboto \
    fontconfig \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Make the repository font available to Chromium.
# (5 cortes estáticos da Inter, um por peso — nenhum fonts.conf/alias
# necessário: "Inter" já é o nome de família real gravado dentro de cada
# .ttf, então o fontconfig encontra os 5 arquivos pelo nome automaticamente.)
COPY fonts/ /usr/local/share/fonts/inter/

RUN fc-cache -f -v

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY server.js LastfmCard.html fonts.css ./
COPY fonts/ ./fonts/

EXPOSE 3000

CMD ["node", "server.js"]
