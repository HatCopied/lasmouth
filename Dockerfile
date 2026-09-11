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

# Fallback a nível de SO. Mantido só como rede de segurança para qualquer
# coisa que ainda dependa do nome "Segoe UI" via fontconfig -- mas quem
# manda agora nos pesos (bold/black) é o @font-face explícito do fonts.css,
# carregado direto pela página, sem passar pelo fontconfig do sistema.
COPY fonts/ /usr/local/share/fonts/segoe-ui/
COPY fonts.conf /etc/fonts/local.conf
RUN fc-cache -f -v

WORKDIR /app

COPY package*.json ./
RUN npm ci

# server.js, o HTML do card e o novo fonts.css (com os @font-face de cada peso).
COPY server.js LastfmCard.html fonts.css ./

# A pasta de fontes também precisa existir aqui em /app/fonts, porque é para
# lá que os url() relativos do fonts.css apontam quando o Chromium abre o
# arquivo localmente (o Puppeteer carrega o HTML do disco, não passa pelo
# Express -- então servir /fonts como estático não resolve isso; o arquivo
# físico precisa estar do lado do HTML).
COPY fonts/ ./fonts/

EXPOSE 3000

CMD ["node", "server.js"]
