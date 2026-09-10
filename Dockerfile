# O Render (no plano "Web Service" comum, sem Docker) nem sempre tem todas
# as bibliotecas que o Chromium do Puppeteer precisa (libnss3, libatk etc).
# Usar Docker garante que essas dependências existem, sem depender do que
# o ambiente padrão do Render tiver instalado.
FROM node:20-slim

# Dependências de sistema que o Chromium (baixado pelo Puppeteer) precisa
# para rodar em modo headless dentro de um container Linux mínimo.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes1 \
    libxkbcommon0 \
    libxrandr1 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
