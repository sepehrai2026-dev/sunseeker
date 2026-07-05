const App = (() => {
  let walletAddress = null;
  let currentUPC = null;
  let currentScreen = 'home';

  const MINT_STORE_KEY = 'barcade_mints';
  const CONTRACT_ADDRESS = ''; // set after Base deployment

  /* ================= scanner engine =================
     Strategy: we own the camera (getUserMedia + <video playsinline>),
     decoders only ever see frames. Native BarcodeDetector where available,
     zxing-wasm (dynamic import) everywhere else. Photo upload as fallback. */

  const BARCODE_FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39'];
  const ZXING_FORMATS = ['UPC-A', 'UPC-E', 'EAN-13', 'EAN-8', 'Code128', 'Code39'];

  let mediaStream = null;
  let scanLoopId = null;
  let detector = null;      // BarcodeDetector instance
  let zxing = null;         // zxing-wasm module
  let scanBusy = false;
  let scanCanvas = null;

  async function ensureDecoder() {
    if (detector || zxing) return;
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = BARCODE_FORMATS.filter(f => supported.includes(f));
        if (formats.length) {
          detector = new window.BarcodeDetector({ formats });
          return;
        }
      } catch (e) { /* fall through to zxing */ }
    }
    zxing = await import('https://cdn.jsdelivr.net/npm/zxing-wasm@2.2.0/dist/es/reader/index.js');
  }

  async function decodeFrame(source, w, h) {
    if (detector) {
      const codes = await detector.detect(source);
      if (codes && codes.length) return codes[0].rawValue;
      return null;
    }
    if (zxing) {
      if (!scanCanvas) scanCanvas = document.createElement('canvas');
      scanCanvas.width = w; scanCanvas.height = h;
      const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const results = await zxing.readBarcodes(imageData, { formats: ZXING_FORMATS, maxNumberOfSymbols: 1 });
      if (results && results.length && results[0].isValid) return results[0].text;
    }
    return null;
  }

  function isPlausibleCode(text) {
    return /^\d{6,14}$/.test((text || '').trim());
  }

  async function startScan() {
    showScreen('scanner');
    const video = document.getElementById('scan-video');
    const hint = document.getElementById('scanner-hint');
    const frame = document.getElementById('scanner-frame');
    const torchBtn = document.getElementById('torch-btn');
    document.getElementById('manual-entry').classList.remove('hidden');
    document.getElementById('camera-fallback').classList.add('hidden');
    frame.style.display = '';
    video.style.display = '';
    torchBtn.classList.add('hidden');
    hint.textContent = 'Starting camera…';

    stopScanner();

    // decoder loads in parallel with camera permission
    const decoderReady = ensureDecoder().catch(() => {});

    const attempts = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) { lastErr = err; }
    }

    if (!mediaStream) {
      console.warn('Camera unavailable:', lastErr);
      showCameraFallback(lastErr);
      return;
    }

    video.srcObject = mediaStream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch (e) { /* iOS may need the gesture; play() was user-initiated */ }

    // torch support
    const track = mediaStream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) torchBtn.classList.remove('hidden');
    } catch (e) { /* no capabilities API */ }

    await decoderReady;
    if (!detector && !zxing) {
      showCameraFallback(new Error('No barcode decoder available'));
      return;
    }
    hint.textContent = 'Align the barcode within the frame';

    let stableValue = null, stableCount = 0;
    const tick = async () => {
      if (!mediaStream) return;
      if (!scanBusy && video.readyState >= 2 && video.videoWidth > 0) {
        scanBusy = true;
        try {
          const value = await decodeFrame(video, video.videoWidth, video.videoHeight);
          if (value && isPlausibleCode(value)) {
            // require the same read twice in a row to avoid misreads
            if (value === stableValue) stableCount++;
            else { stableValue = value; stableCount = 1; }
            if (stableCount >= 2) {
              onScanSuccess(value);
              return;
            }
          }
        } catch (e) { /* keep scanning */ }
        scanBusy = false;
      }
      scanLoopId = requestAnimationFrame(() => setTimeout(tick, 90));
    };
    tick();
  }

  let torchOn = false;
  async function toggleTorch() {
    if (!mediaStream) return;
    const track = mediaStream.getVideoTracks()[0];
    torchOn = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      document.getElementById('torch-btn').classList.toggle('torch-on', torchOn);
    } catch (e) { showToast('Torch not supported on this camera'); }
  }

  function showCameraFallback(err) {
    stopScanner();
    const video = document.getElementById('scan-video');
    const hint = document.getElementById('scanner-hint');
    video.style.display = 'none';
    document.getElementById('scanner-frame').style.display = 'none';
    const fb = document.getElementById('camera-fallback');
    fb.classList.remove('hidden');
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    hint.textContent = denied
      ? 'Camera permission was denied — snap a photo of the barcode or type the number instead.'
      : 'Camera not available — snap a photo of the barcode or type the number instead.';
    setTimeout(() => document.getElementById('upc-input').focus(), 100);
  }

  function stopScanner() {
    if (scanLoopId) { cancelAnimationFrame(scanLoopId); scanLoopId = null; }
    scanBusy = false;
    if (mediaStream) {
      for (const t of mediaStream.getTracks()) t.stop();
      mediaStream = null;
    }
    const video = document.getElementById('scan-video');
    if (video) video.srcObject = null;
    torchOn = false;
  }

  async function scanFromPhoto(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    showToast('Reading photo…');
    try {
      await ensureDecoder();
      const bmp = await createImageBitmap(file);
      // try a few scales — barcodes in photos are often small or huge
      for (const maxW of [1600, 1000, 640]) {
        const scale = Math.min(1, maxW / bmp.width);
        const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
        const value = await decodeFrame(bmp, w, h);
        if (value && isPlausibleCode(value)) { onScanSuccess(value); return; }
      }
      showToast('No barcode found in that photo — try a closer, sharper shot');
    } catch (e) {
      console.warn('Photo decode failed:', e);
      showToast('Could not read that photo');
    }
  }

  function showManualEntry() {
    showScreen('scanner');
    stopScanner();
    document.getElementById('scan-video').style.display = 'none';
    document.getElementById('scanner-frame').style.display = 'none';
    document.getElementById('scanner-hint').textContent = 'Type any product barcode number';
    document.getElementById('camera-fallback').classList.remove('hidden');
    document.getElementById('manual-entry').classList.remove('hidden');
    setTimeout(() => document.getElementById('upc-input').focus(), 100);
  }

  function submitManualUPC() {
    const input = document.getElementById('upc-input');
    const upc = input.value.trim();
    if (!isPlausibleCode(upc)) {
      showToast('Enter a valid numeric barcode (6–14 digits)');
      return;
    }
    stopScanner();
    revealArt(upc);
  }

  function onScanSuccess(decodedText) {
    stopScanner();
    if (navigator.vibrate) navigator.vibrate(60);
    showToast('Barcode detected: ' + decodedText);
    revealArt(decodedText.trim());
  }

  /* ================= product lookup ================= */

  const PRODUCT_SOURCES = [
    { name: 'Open Food Facts', url: u => `https://world.openfoodfacts.org/api/v2/product/${u}.json?fields=product_name,brands,quantity,image_small_url` },
    { name: 'Open Products Facts', url: u => `https://world.openproductsfacts.org/api/v2/product/${u}.json?fields=product_name,brands,quantity,image_small_url` },
    { name: 'Open Beauty Facts', url: u => `https://world.openbeautyfacts.org/api/v2/product/${u}.json?fields=product_name,brands,quantity,image_small_url` },
  ];

  async function fetchProduct(upc) {
    const enc = encodeURIComponent(upc);
    for (const src of PRODUCT_SOURCES) {
      try {
        const resp = await fetch(src.url(enc));
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.status === 1 && data.product && (data.product.product_name || data.product.brands)) {
          const p = data.product;
          return {
            name: p.product_name || '',
            brand: p.brands || '',
            qty: p.quantity || '',
            image: p.image_small_url || '',
            source: src.name,
          };
        }
      } catch (e) { /* try next source */ }
    }
    // BARCADE API worker proxies UPCitemdb (general retail: electronics, toys,
    // household) server-side, since it has no CORS support, and edge-caches hits.
    try {
      const resp = await fetch(`https://barcade-api.sepehrai2026.workers.dev/lookup?upc=${enc}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.found) {
          return { name: data.name, brand: data.brand, qty: data.qty, image: data.image, source: data.source };
        }
      }
    } catch (e) { /* offline; give up gracefully */ }
    return null;
  }

  async function lookupProduct(upc) {
    const el = document.getElementById('product-info');
    if (!el) return;
    el.innerHTML = '<span class="product-loading">Identifying product…</span>';
    el.classList.remove('hidden');
    const p = await fetchProduct(upc);
    if (p) {
      let label = p.brand && p.name ? `${p.brand} — ${p.name}` : (p.name || p.brand);
      if (p.qty) label += ` (${p.qty})`;
      const img = p.image ? `<img class="product-thumb" src="${escapeAttr(p.image)}" alt="" loading="lazy">` : '';
      el.innerHTML = `${img}<span class="product-name">${escapeHtml(label)}</span>`;
    } else {
      el.innerHTML = `<span class="product-name product-unknown">Product not in public databases — the art is still one of a kind</span>`;
    }
  }

  /* ================= wallet / mint (demo until contract is live) ================= */

  function getMintData() {
    try { return JSON.parse(localStorage.getItem(MINT_STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveMintData(data) { localStorage.setItem(MINT_STORE_KEY, JSON.stringify(data)); }
  function getMintCount(upc) { return getMintData()[upc] || 0; }
  function incrementMint(upc) {
    const data = getMintData();
    data[upc] = (data[upc] || 0) + 1;
    saveMintData(data);
    return data[upc];
  }

  async function connectWallet() {
    if (walletAddress) {
      showToast('Wallet connected: ' + walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4));
      return;
    }
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        walletAddress = accounts[0];
        markWalletConnected();
        showToast('Wallet connected');
        return;
      } catch (err) {
        showToast('Wallet connection cancelled');
        return;
      }
    }
    // no wallet extension: create a local guest identity, honestly labeled
    walletAddress = localStorage.getItem('barcade_guest') ||
      ('guest-' + Array.from({ length: 8 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''));
    localStorage.setItem('barcade_guest', walletAddress);
    markWalletConnected();
    showToast('No wallet found — continuing as guest');
  }

  function markWalletConnected() {
    const btn = document.getElementById('wallet-btn');
    btn.classList.add('connected');
    const label = walletAddress.startsWith('guest-')
      ? 'Guest · ' + walletAddress.slice(6, 10)
      : walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4);
    document.getElementById('wallet-text').textContent = label;
  }

  async function mint() {
    if (!currentUPC) return;
    const rarity = ArtEngine.getRarity(currentUPC);
    if (getMintCount(currentUPC) > 0) { showToast('This barcode has already been claimed'); return; }

    if (!walletAddress) {
      await connectWallet();
      if (!walletAddress) return;
    }

    const mintBtn = document.getElementById('mint-btn');
    const mintText = document.getElementById('mint-btn-text');
    const mintLoading = document.getElementById('mint-btn-loading');
    const mintStatus = document.getElementById('mint-status');

    mintBtn.disabled = true;
    mintText.classList.add('hidden');
    mintLoading.classList.remove('hidden');
    mintStatus.textContent = 'Claiming this 1 of 1…';
    await delay(900);

    incrementMint(currentUPC);

    mintLoading.classList.add('hidden');
    mintText.textContent = 'Claimed';
    mintText.classList.remove('hidden');
    mintBtn.classList.add('minted');
    mintBtn.disabled = true;
    mintStatus.innerHTML =
      `This 1 of 1 is now claimed by ` +
      `<strong>${escapeHtml(walletAddress.startsWith('guest-') ? 'your guest profile' : walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4))}</strong><br>` +
      `<span class="mint-note">Off-chain demo claim — on-chain minting on Base is coming soon. One mint per barcode, forever.</span>`;

    document.getElementById('rarity-edition').textContent = 'Claimed — this barcode is taken';
    document.getElementById('mint-progress-fill').style.width = '100%';
    document.getElementById('mint-progress-text').textContent = '0 of 1 remaining';
    showToast('Claimed — it is yours');
  }

  /* ================= screens / render ================= */

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById('screen-' + name);
    if (screen) screen.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === name);
    });
    if (name !== 'scanner') stopScanner();
    currentScreen = name;
  }

  function showToast(msg, duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  function goHome() {
    stopScanner();
    showScreen('home');
  }

  function renderRarityBreakdown(el, components) {
    let html = '';
    for (const c of components) {
      const barColor = c.score >= 80 ? 'var(--gold)' : c.score >= 60 ? 'var(--accent)' : c.score >= 40 ? 'var(--blue)' : 'var(--text2)';
      html += `<div class="rarity-component">
        <div class="rc-header">
          <span class="rc-icon">${c.icon}</span>
          <span class="rc-name">${c.name}</span>
          <span class="rc-score" style="color:${barColor}">${c.score}</span>
        </div>
        <div class="rc-bar"><div class="rc-bar-fill" style="width:${c.score}%;background:${barColor}"></div></div>
      </div>`;
    }
    return html;
  }

  function revealArt(upc) {
    currentUPC = upc;
    showScreen('art');

    const rarityData = ArtEngine.getRarityComponents(upc);
    const rarity = { tier: rarityData.tier, maxMints: rarityData.maxMints, color: rarityData.color, glow: rarityData.glow };
    const name = ArtEngine.getArtName(upc);
    const svg = ArtEngine.generate(upc);
    const claimed = getMintCount(upc) > 0;

    document.getElementById('art-display').innerHTML = svg;
    document.getElementById('art-name').textContent = name;
    document.getElementById('art-upc-display').textContent =
      `UPC ${upc} · ${ArtEngine.getFamily(upc)} · ${ArtEngine.getPalette(upc)}`;

    const badge = document.getElementById('rarity-badge-display');
    badge.textContent = rarity.tier;
    badge.style.color = rarity.color;
    badge.style.background = rarity.glow;

    document.getElementById('rarity-edition').textContent =
      claimed ? 'Claimed — this barcode is taken' : '1 of 1 — still unclaimed';

    document.getElementById('mint-progress-fill').style.width = claimed ? '100%' : '0%';
    document.getElementById('mint-progress-text').textContent =
      claimed ? '0 of 1 remaining' : '1 of 1 available — first to claim it owns it';

    const frame = document.getElementById('art-frame');
    frame.className = '';
    frame.classList.add(rarity.tier.toLowerCase());

    const mintBtn = document.getElementById('mint-btn');
    const mintText = document.getElementById('mint-btn-text');
    const mintLoading = document.getElementById('mint-btn-loading');
    mintBtn.disabled = claimed;
    mintBtn.classList.remove('minted');
    mintText.classList.remove('hidden');
    mintLoading.classList.add('hidden');
    mintText.textContent = claimed ? 'Already Claimed' : 'Claim This 1 of 1 — Free';
    document.getElementById('mint-status').textContent = '';

    const breakdown = document.getElementById('rarity-breakdown');
    breakdown.innerHTML = renderRarityBreakdown(breakdown, rarityData.components);
    breakdown.classList.remove('hidden');

    lookupProduct(upc);
  }

  function showLookup() {
    showScreen('lookup');
    document.getElementById('lookup-result').classList.add('hidden');
    document.getElementById('lookup-input').value = '';
    setTimeout(() => document.getElementById('lookup-input').focus(), 100);
  }

  function lookupUPC() {
    const input = document.getElementById('lookup-input');
    const upc = input.value.trim();
    if (!isPlausibleCode(upc)) {
      showToast('Enter a valid numeric barcode (6–14 digits)');
      return;
    }

    const rarityData = ArtEngine.getRarityComponents(upc);
    const rarity = { tier: rarityData.tier, maxMints: rarityData.maxMints, color: rarityData.color, glow: rarityData.glow };
    const name = ArtEngine.getArtName(upc);
    const svg = ArtEngine.generate(upc);
    const claimed = getMintCount(upc) > 0;

    const result = document.getElementById('lookup-result');
    result.classList.remove('hidden');
    result.innerHTML = `
      <div class="lookup-art">${svg}</div>
      <div class="lookup-name">${escapeHtml(name)}</div>
      <span class="lookup-rarity" style="color:${rarity.color};background:${rarity.glow}">${rarity.tier}</span>
      <div class="lookup-mints" style="color:${claimed ? 'var(--red)' : 'var(--green)'}">${claimed ? 'CLAIMED' : 'AVAILABLE'}</div>
      <div class="lookup-mints-label">${claimed ? 'this barcode is taken — every UPC is a 1 of 1' : '1 of 1 — first to claim it owns it'}</div>
      <div class="lookup-bar"><div class="lookup-bar-fill" style="width:${claimed ? 100 : 0}%"></div></div>
      <div class="lookup-breakdown">${renderRarityBreakdown(null, rarityData.components)}</div>
      ${claimed ? '' : `<button class="lookup-scan-btn" onclick="App.revealArt('${escapeAttr(upc)}')">View &amp; Claim This Art</button>`}
    `;
  }

  /* ================= utils ================= */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (currentScreen === 'scanner') submitManualUPC();
      if (currentScreen === 'lookup') lookupUPC();
    }
  });

  // stop the camera when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentScreen === 'scanner') stopScanner();
  });

  return {
    goHome,
    connectWallet,
    startScan,
    showManualEntry,
    submitManualUPC,
    scanFromPhoto,
    toggleTorch,
    mint,
    showLookup,
    lookupUPC,
    revealArt
  };
})();
