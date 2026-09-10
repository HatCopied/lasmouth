# Em vez de listar manualmente as bibliotecas do Chromium (frágil: os nomes
# dos pacotes mudam entre versões do Debian), instalamos o Google Chrome
# oficial direto do repositório do Google. O apt resolve as dependências
# dele sozinho, então isso não quebra quando a imagem base atualiza.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Usa o Chrome instalado acima em vez do Chromium que o Puppeteer baixaria
# sozinho — mais rápido de buildar e evita depender do CDN dele.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
