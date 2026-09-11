const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
const htmlFile = path.join(__dirname, 'LastfmCard.html');

// Recebe o HTML atual do navegador para gerar a imagem exatamente como o usuário está vendo.
app.use('/download-image', express.text({ type: ['text/html', 'text/plain'], limit: '2mb' }));

app.get('/', (req, res) => {
  res.sendFile(htmlFile);
});

app.get('/download', (req, res) => {
  res.download(htmlFile, 'LastfmCard.html', (err) => {
    if (err && !res.headersSent) res.status(500).send('Erro ao baixar o arquivo.');
  });
});

// Busca a galeria de fotos de um artista em last.fm/music/<Artista>/+images.
// Essa busca precisa acontecer aqui no servidor (e não no navegador) por
// causa de CORS: o site do Last.fm não libera esse tipo de acesso direto
// via fetch() do front-end.
const ARTIST_IMAGE_PAGE_LIMIT = 4; // quantas páginas da galeria buscar por padrão
const ARTIST_IMAGE_TIMEOUT_MS = 10000;
// Atualizado em 01/09/2026: o Last.fm trocou o CDN de
// "lastfm.freetls.fmstatic.com" para "lastfm-img.freetls.fastly.net", e as
// fotos da galeria (dentro de <ul class="image-list">) agora vêm na pasta
// "avatar170s", sem extensão no final da URL (ex: .../avatar170s/<hash>).
// Restringimos à pasta avatar170s de propósito: o mesmo domínio também serve
// avatares de "ouvintes" e de "artistas parecidos" em outras seções da
// página, e não queremos misturar essas fotos com a galeria do artista.
const ARTIST_IMAGE_REGEX = /https:\/\/lastfm-img\.freetls\.fastly\.net\/i\/u\/avatar170s\/[0-9a-f]{20,40}/gi;

function extractGalleryImages(html) {
  const urls = new Set();
  let match;
  while ((match = ARTIST_IMAGE_REGEX.exec(html)) !== null) {
    urls.add(match[0]);
  }
  // Troca o tamanho da miniatura por uma versão maior, mantendo o mesmo
  // hash/arquivo da imagem (o Last.fm serve a mesma foto em vários tamanhos).
  return Array.from(urls).map((url) => url.replace('/i/u/avatar170s/', '/i/u/770x0/'));
}

app.get('/artist-images', async (req, res) => {
  const artist = (req.query.artist || '').toString().trim();
  if (!artist) {
    return res.status(400).json({ error: 'Parâmetro "artist" é obrigatório.' });
  }

  // Segue exatamente o padrão da URL do site: espaços viram "+".
  const slug = encodeURIComponent(artist).replace(/%20/g, '+');
  const pages = Math.min(Math.max(parseInt(req.query.pages, 10) || ARTIST_IMAGE_PAGE_LIMIT, 1), 10);

  try {
    const allImages = [];
    const seen = new Set();

    for (let page = 1; page <= pages; page++) {
      const url = `https://www.last.fm/music/${slug}/+images${page > 1 ? `?page=${page}` : ''}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ARTIST_IMAGE_TIMEOUT_MS);

      let response;
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) break;

      const html = await response.text();
      const pageImages = extractGalleryImages(html).filter((img) => {
        if (seen.has(img)) return false;
        seen.add(img);
        return true;
      });

      if (!pageImages.length) break; // acabaram as páginas com fotos novas
      allImages.push(...pageImages);
    }

    res.set('Cache-Control', 'no-store');
    res.json({ images: allImages });
  } catch (err) {
    console.error('Erro ao buscar galeria do Last.fm:', err);
    res.status(502).json({ error: 'Não foi possível buscar a galeria no Last.fm.' });
  }
});

app.post('/download-image', async (req, res) => {
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).send('HTML do card não recebido.');
  }

  // Tempo máximo (ms) que esperamos por CADA imagem do card (ex: fotos
  // escolhidas na galeria do Last.fm, que precisam ser baixadas de novo
  // pelo Chromium headless, sem o cache do navegador do usuário).
  // Se o CDN do Last.fm travar/atrasar em uma única foto, a gente desiste
  // só dela e segue com o restante — antes, uma imagem "engasgada" travava
  // o download inteiro até o Puppeteer estourar o protocolTimeout.
  const PER_IMAGE_TIMEOUT_MS = 8000;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // Rede de segurança: mesmo com o timeout por imagem abaixo, deixamos
      // uma margem maior aqui para qualquer outra chamada de protocolo
      // (renderização de fontes, screenshot em alta resolução etc.) não
      // esbarrar no timeout padrão do Puppeteer (30s).
      protocolTimeout: 120000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 4 });

    // Alguns CDNs (como o do Last.fm) tratam requisições sem User-Agent/Referer
    // de forma diferente (throttle, bloqueio silencioso). Isso reduz a chance
    // de uma imagem nunca disparar nem "load" nem "error".
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Referer': 'https://www.last.fm/' });

    // O navegador cliente envia uma cópia do DOM já preenchida.
    // Os scripts são removidos para não disparar uma nova busca no Last.fm.
    const safeHtml = req.body.replace(/<script[\s\S]*?<\/script>/gi, '');
    await page.setContent(safeHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.evaluate(async (perImageTimeout) => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
          };
          // Se a imagem nunca disparar load/error (ex: CDN travado),
          // desistimos dela sozinha em vez de travar o card inteiro.
          const timer = setTimeout(finish, perImageTimeout);
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        });
      }));
    }, PER_IMAGE_TIMEOUT_MS);

    const card = await page.$('.card-container');
    if (!card) return res.status(400).send('Card não encontrado.');

    const png = await card.screenshot({ type: 'png' });
    const username = await page.$eval('.username', el =>
      (el.textContent || 'last-month').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    ).catch(() => 'last-month');

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${username || 'last-month'}-rewind.png"`,
      'Cache-Control': 'no-store'
    });
    res.send(png);
  } catch (err) {
    console.error('Erro ao gerar PNG:', err);
    if (!res.headersSent) res.status(500).send('Não foi possível gerar a imagem.');
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
