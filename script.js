// script.js — simple client-side QR generator
const el = id => document.getElementById(id);
const input = el('input');
const deterministic = el('deterministic');
const sizeInput = el('size');
const fg = el('fg');
const bg = el('bg');
const generateBtn = el('generate');
const downloadBtn = el('download');
const downloadHighResBtn = el('downloadHighRes');
const copyBtn = el('copyPayload');
const testDecodeBtn = el('testDecode');
const qrcodeEl = el('qrcode');
const payloadEl = el('payload');
const baseUrl = el('baseUrl');
const scannerFriendly = el('scannerFriendly');

let lastPayload = '';
let qrInstance = null;

function isUrl(text){
  try{
    const u = new URL(text);
    return u.protocol === 'http:' || u.protocol === 'https:';
  }catch(e){return false}
}

function shortYouTubeUrl(url){
  try{
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if(host.includes('youtube.com')){
      const params = new URLSearchParams(u.search);
      if(params.has('v')){
        return `https://youtu.be/${params.get('v')}`;
      }
    }
  }catch(e){ }
  return url;
}

function uuidv4(){
  // simple client-side UUID v4
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

async function deterministicId(text){
  // derive short deterministic id from SHA-256
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
}

function clearQR(){
  qrcodeEl.innerHTML = '';
  payloadEl.textContent = '';
  lastPayload = '';
  downloadBtn.disabled = true;
  copyBtn.disabled = true;
}

async function generate(){
  let text = input.value.trim();
  // strip surrounding quotes if user pasted with quotes (common when copying URLs)
  text = text.replace(/^\s*["'`]+|["'`]+\s*$/g, '');
  if(!text){ alert('Please paste a link or type a username.'); return }

  let payload;
  if(isUrl(text)){
    // If the user pasted a URL, prefer encoding it directly even if Base URL is set
    // For known problematic long links (YouTube), use the short youtu.be form to improve scanner behaviour
    payload = shortYouTubeUrl(text);
  } else {
    // If a base URL is provided, build a clickable URL so phone scanners open it
    const base = (baseUrl && baseUrl.value) ? baseUrl.value.trim() : '';
    if(base){
      // validate base URL
      try{
        const parsed = new URL(base);
        if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('invalid scheme');
      }catch(e){
        alert('Base URL must be a valid http/https URL');
        return;
      }

      let shortId;
      if(deterministic.checked){
        shortId = (await deterministicId(text)).slice(0,8);
      } else {
        shortId = uuidv4().slice(0,8);
      }
      const cleanBase = base.replace(/\/+$/,'');
      payload = `${cleanBase}/user/${encodeURIComponent(text)}?id=${shortId}`;
    } else {
      if(deterministic.checked){
        const id = await deterministicId(text);
        payload = `user:${text}|id:${id}`;
      } else {
        const id = uuidv4();
        payload = `user:${text}|id:${id}`;
      }
    }
  }

  lastPayload = payload;
  payloadEl.textContent = payload;

  // If payload is a URL, prefer a scanner-friendly high-contrast QR
  const isPayloadUrl = isUrl(payload);

  // clear previous
  qrcodeEl.innerHTML = '';
  const size = Math.max(64, Math.min(1024, parseInt(sizeInput.value)||256));

  // qrcodejs creates an <img> or <canvas> inside the container
  const qrOptions = {
    text: payload,
    width: size,
    height: size,
    colorDark: fg.value,
    colorLight: bg.value,
    correctLevel: QRCode.CorrectLevel.M
  };

  if(isPayloadUrl){
    // Optionally enforce high contrast and higher error correction for scanner reliability
    if(!scannerFriendly || scannerFriendly.checked){
      qrOptions.colorDark = '#000000';
      qrOptions.colorLight = '#ffffff';
      qrOptions.correctLevel = QRCode.CorrectLevel.H;
    }

    // choose a size that fits the preview area instead of forcing a large fixed size
    const preview = document.querySelector('.preview');
    const previewWidth = preview ? preview.clientWidth : window.innerWidth;
    // reserve space for payload column; target up to ~48% of preview width
    const maxAllowed = Math.max(128, Math.floor(previewWidth * 0.48));
    const chosen = Math.min(qrOptions.width, maxAllowed);
    qrOptions.width = chosen;
    qrOptions.height = chosen;

  // small user hint (non-intrusive)
    let hint = document.getElementById('hint');
    if(!hint){ hint = document.createElement('div'); hint.id = 'hint'; qrcodeEl.parentNode.appendChild(hint); }
  hint.textContent = 'Scanner-friendly QR generated for URL payload.' + (scannerFriendly && !scannerFriendly.checked ? ' (scanner-friendly disabled)' : '');
    hint.style.color = '#9fd';
    hint.style.marginTop = '8px';
  } else {
    const hint = document.getElementById('hint'); if(hint) hint.textContent = '';
  }

  qrInstance = new QRCode(qrcodeEl, qrOptions);

  // enable download after a tick (the lib may render async)
  setTimeout(()=>{
    const img = qrcodeEl.querySelector('img') || qrcodeEl.querySelector('canvas');
    if(img){ downloadBtn.disabled = false; copyBtn.disabled = false }
    if(testDecodeBtn) testDecodeBtn.disabled = false;
    if(downloadHighResBtn) downloadHighResBtn.disabled = false;
  }, 50);
}

function downloadHighRes(){
  const node = qrcodeEl.querySelector('img') || qrcodeEl.querySelector('canvas');
  if(!node) return;

  // get base filename
  const name = (lastPayload && lastPayload.startsWith('user:') ? lastPayload.split('|')[0].replace('user:','') : (lastPayload ? (new URL(lastPayload).hostname || 'qrcode') : 'qrcode'));

  // draw source into a temporary canvas
  const srcCanvas = document.createElement('canvas');
  const srcCtx = srcCanvas.getContext('2d');
  let srcW, srcH;
  if(node.tagName === 'IMG'){
    const img = node;
    srcW = img.naturalWidth || img.width;
    srcH = img.naturalHeight || img.height;
    srcCanvas.width = srcW; srcCanvas.height = srcH;
    srcCtx.drawImage(img, 0, 0, srcW, srcH);
  } else {
    // canvas
    const c = node;
    srcW = c.width || c.offsetWidth;
    srcH = c.height || c.offsetHeight;
    srcCanvas.width = srcW; srcCanvas.height = srcH;
    srcCtx.drawImage(c, 0, 0);
  }

  // target size: aim for at least 1024px on the larger side, preserve aspect
  const maxSide = Math.max(srcW, srcH);
  const scale = Math.max(1, Math.ceil(1024 / maxSide));
  const targetW = srcW * scale;
  const targetH = srcH * scale;

  const out = document.createElement('canvas');
  out.width = targetW; out.height = targetH;
  const outCtx = out.getContext('2d');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, targetW, targetH);

  const dataUrl = out.toDataURL('image/png');
  // Convert to blob and download via object URL for better compatibility on hosted sites
  fetch(dataUrl).then(r=>r.blob()).then(blob=>{
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }).catch(err=>{
    console.error('High-res download failed', err);
    alert('High-res download failed — try the regular Download or check the browser console.');
  });
}

function runDecodeTest(){
  const decodeResult = document.getElementById('decodeResult');
  decodeResult.textContent = '';
  const node = qrcodeEl.querySelector('img') || qrcodeEl.querySelector('canvas');
  if(!node){ decodeResult.textContent = 'No QR available to decode.'; return }

  // Create an offscreen canvas and draw the image (or use canvas directly)
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let w, h;
  if(node.tagName === 'CANVAS'){
    w = node.width || node.offsetWidth; h = node.height || node.offsetHeight;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(node, 0, 0);
  } else {
    // IMG
    const img = node;
    w = img.naturalWidth || img.width; h = img.naturalHeight || img.height;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  }

  try{
    const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if(code && code.data){
      const text = code.data;
      decodeResult.innerHTML = `Decoded: <code style="color:var(--accent)">${text}</code>`;
      if(text.startsWith('http://') || text.startsWith('https://')){
        const a = document.createElement('a');
        a.href = text; a.textContent = ' Open link'; a.style.marginLeft='8px'; a.target='_blank';
        decodeResult.appendChild(a);
      }
    } else {
      decodeResult.textContent = 'No QR detected / decoding failed.';
    }
  }catch(err){
    decodeResult.textContent = 'Decoding failed: ' + err.message;
  }
}

function download(){
  const node = qrcodeEl.querySelector('img') || qrcodeEl.querySelector('canvas');
  if(!node) return;
  // Build data URL from image or canvas
  let dataUrl;
  if(node.tagName === 'IMG'){
    dataUrl = node.src;
  } else {
    dataUrl = node.toDataURL('image/png');
  }

  // Convert dataURL to a Blob and use an object URL for a robust download
  fetch(dataUrl).then(res => res.blob()).then(blob => {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (lastPayload && lastPayload.startsWith('user:') ? lastPayload.split('|')[0].replace('user:','') : (lastPayload ? (new URL(lastPayload).hostname || 'qrcode') : 'qrcode'));
    a.href = blobUrl;
    a.download = `${name}_qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoke object URL after a short delay
    setTimeout(()=> URL.revokeObjectURL(blobUrl), 1500);
  }).catch(err=>{
    console.error('Download failed', err);
    alert('Download failed — please try right-clicking the QR image and Save image as... or check the console for details.');
  });
}

function copyPayload(){
  if(!lastPayload) return;
  navigator.clipboard.writeText(lastPayload).then(()=>{
    copyBtn.textContent = 'Copied!';
    setTimeout(()=>copyBtn.textContent = 'Copy Payload',800);
  });
}

generateBtn.addEventListener('click', generate);
if(testDecodeBtn) testDecodeBtn.addEventListener('click', runDecodeTest);
if(downloadHighResBtn) downloadHighResBtn.addEventListener('click', downloadHighRes);
downloadBtn.addEventListener('click', download);
copyBtn.addEventListener('click', copyPayload);

// allow Enter to submit
input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') generate(); });

// initialize
clearQR();
