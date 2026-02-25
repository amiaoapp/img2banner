(() => {
  const fileInput = document.getElementById('fileInput');
  const dropArea = document.getElementById('dropArea');
  const mainCanvas = document.getElementById('mainCanvas');
  const previewCtx = mainCanvas.getContext('2d');

  const canvasW = document.getElementById('canvasW');
  const canvasH = document.getElementById('canvasH');
  const innerSize = document.getElementById('innerSize');
  const innerSizeNum = document.getElementById('innerSizeNum');
  const transparent = document.getElementById('transparent');
  const bgColor = document.getElementById('bgColor');
  const format = document.getElementById('format');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');

  let img = null;
  let origImg = null; // 原始图片，用于重新生成内图

  // 可视裁切状态
  let crop = { centerX: 0, centerY: 0, baseScale: 1, zoom: 1 };

  // theme handling (按钮切换)
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('img2banner-theme') || 'dark';
  function applyTheme(name){
    if(name === 'light') document.documentElement.setAttribute('data-theme','light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('img2banner-theme', name);
    if(themeToggle) themeToggle.setAttribute('aria-pressed', name === 'light');
  }
  if(themeToggle){
    themeToggle.addEventListener('click', e=>{
      const next = (localStorage.getItem('img2banner-theme')||'dark') === 'light' ? 'dark' : 'light';
      themeToggle.animate([{transform:'rotate(0)'},{transform:'rotate(360deg)'}],{duration:360});
      applyTheme(next);
    });
  }
  applyTheme(savedTheme);

  function reset(){
    img = null; draw();
  }

  function draw(){
    const w = +canvasW.value || 300;
    const h = +canvasH.value || 200;
    mainCanvas.width = w; mainCanvas.height = h;

    // clear
    previewCtx.clearRect(0,0,w,h);

    // background
    if(!transparent.checked){
      previewCtx.fillStyle = bgColor.value; previewCtx.fillRect(0,0,w,h);
    }

    if(!img) return; // nothing to draw

    const target = +innerSizeNum.value || +innerSize.value;
    // assume incoming image is square-ish; scale to fit target
    const sx = img.naturalWidth; const sy = img.naturalHeight;
    // compute scale to fit inside target while preserving source aspect
    const ratio = Math.min(target / sx, target / sy);
    const drawW = sx * ratio; const drawH = sy * ratio;

    const dx = Math.round((w - drawW) / 2);
    const dy = Math.round((h - drawH) / 2);

    previewCtx.imageSmoothingEnabled = true;
    previewCtx.drawImage(img, 0, 0, sx, sy, dx, dy, drawW, drawH);
  }

  function loadFile(file){
    if(!file) return;
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { origImg = i; generateInnerFromOrig(); URL.revokeObjectURL(url); };
    i.onerror = () => { URL.revokeObjectURL(url); alert('无法加载图片'); };
    i.src = url;
  }

  // 将原始图片裁切/缩放为目标内图尺寸（cover 模式，可调整中心和缩放），并生成新 Image 赋值给 `img`
  function generateInnerFromOrig(){
    if(!origImg) return;
    const target = +innerSizeNum.value || +innerSize.value || 100;
    const off = document.createElement('canvas');
    off.width = target; off.height = target;
    const ctx = off.getContext('2d');

    const sx = origImg.naturalWidth; const sy = origImg.naturalHeight;
    // fill mode: cover (crop) or pad (contain)
    const mode = (document.getElementById('fillMode') && document.getElementById('fillMode').value) || 'cover';

    // 计算 baseScale 并初始化中心
    const baseScaleCover = Math.max(target / sx, target / sy);
    const baseScalePad = Math.min(target / sx, target / sy);
    const baseScale = mode === 'pad' ? baseScalePad : baseScaleCover;
    crop.baseScale = baseScale;
    if(!crop.centerX && !crop.centerY){ crop.centerX = Math.round(sx/2); crop.centerY = Math.round(sy/2); }
    const currentScale = baseScale * (crop.zoom || 1);

    // source rect 尺寸与坐标（cover: 裁切；pad: 缩放后以背景填充）
    if(mode === 'cover'){
      const srcW = target / currentScale; const srcH = target / currentScale;
      let srcX = Math.round(crop.centerX - srcW/2);
      let srcY = Math.round(crop.centerY - srcH/2);
      srcX = Math.max(0, Math.min(srcX, sx - srcW));
      srcY = Math.max(0, Math.min(srcY, sy - srcH));
      ctx.clearRect(0,0,target,target);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(origImg, srcX, srcY, srcW, srcH, 0,0,target,target);
    } else {
      // pad 模式：等比缩放使图像完整显示并以背景/透明填充
      const drawW = Math.round(sx * baseScale * (crop.zoom || 1));
      const drawH = Math.round(sy * baseScale * (crop.zoom || 1));
      const dx = Math.round((target - drawW)/2);
      const dy = Math.round((target - drawH)/2);
      ctx.clearRect(0,0,target,target);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(origImg, 0,0,sx,sy, dx, dy, drawW, drawH);
    }

    const dataUrl = off.toDataURL('image/png');
    const inner = new Image();
    inner.onload = () => { img = inner; draw(); updateEditor(); };
    inner.onerror = () => { img = origImg; draw(); updateEditor(); };
    inner.src = dataUrl;
  }

  // file input
  fileInput.addEventListener('change', e => { const f = e.target.files[0]; if(f) loadFile(f); });

  // drag/drop
  ['dragenter','dragover'].forEach(ev=> dropArea.addEventListener(ev, e=>{ e.preventDefault(); dropArea.classList.add('hover'); }));
  ['dragleave','drop'].forEach(ev=> dropArea.addEventListener(ev, e=>{ e.preventDefault(); dropArea.classList.remove('hover'); }));
  dropArea.addEventListener('drop', e=>{ const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) loadFile(f); });

  // paste
  window.addEventListener('paste', async e => {
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const it of items){
      if(it.type.startsWith('image/')){
        const blob = it.getAsFile(); loadFile(blob); return;
      }
    }
  });

  // Editor (visual裁切) 初始化
  const editorCanvas = document.getElementById('editorCanvas');
  const edCtx = editorCanvas && editorCanvas.getContext('2d');
  let isDragging = false; let lastPointer = null;
  let pinch = { active:false, startDist:0, startZoom:1, startMid:null };

  function updateEditor(){
    if(!edCtx) return;
    edCtx.clearRect(0,0,editorCanvas.width, editorCanvas.height);
    // 背景棋盘色（canvas 上也画一层以防样式不可见）
    edCtx.fillStyle = 'rgba(0,0,0,0.06)';
    edCtx.fillRect(0,0,editorCanvas.width, editorCanvas.height);
    if(!origImg) return;

    const target = +innerSizeNum.value || +innerSize.value || 100;
    const drawSize = Math.min(editorCanvas.width, editorCanvas.height) - 8;
    const padX = (editorCanvas.width - drawSize)/2; const padY = (editorCanvas.height - drawSize)/2;

    const sx = origImg.naturalWidth; const sy = origImg.naturalHeight;
    const mode = (document.getElementById('fillMode') && document.getElementById('fillMode').value) || 'cover';
    const currentScale = crop.baseScale * (crop.zoom || 1);

    const off = document.createElement('canvas'); off.width = target; off.height = target;
    const octx = off.getContext('2d'); octx.imageSmoothingEnabled = true;
    if(mode === 'cover'){
      const srcW = target / currentScale; const srcH = target / currentScale;
      let srcX = Math.round(crop.centerX - srcW/2);
      let srcY = Math.round(crop.centerY - srcH/2);
      srcX = Math.max(0, Math.min(srcX, sx - srcW));
      srcY = Math.max(0, Math.min(srcY, sy - srcH));
      octx.drawImage(origImg, srcX, srcY, srcW, srcH, 0,0,target,target);
    } else {
      const drawW = Math.round(sx * crop.baseScale * (crop.zoom || 1));
      const drawH = Math.round(sy * crop.baseScale * (crop.zoom || 1));
      const dx = Math.round((target - drawW)/2);
      const dy = Math.round((target - drawH)/2);
      octx.clearRect(0,0,target,target);
      octx.drawImage(origImg, 0,0,sx,sy, dx, dy, drawW, drawH);
    }

    edCtx.drawImage(off, 0,0,target,target, padX, padY, drawSize, drawSize);
    edCtx.strokeStyle = 'rgba(255,255,255,0.95)'; edCtx.lineWidth = 2; edCtx.strokeRect(padX, padY, drawSize, drawSize);
  }

  function getPointerPos(e){
    const r = editorCanvas.getBoundingClientRect(); const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = (e.clientY !== undefined) ? e.clientY : (e.touches && e.touches[0].clientY);
    return {x: clientX - r.left, y: clientY - r.top};
  }

  function editorPointerDown(e){ if(!editorCanvas) return; isDragging = true; lastPointer = getPointerPos(e); editorCanvas.setPointerCapture && editorCanvas.setPointerCapture(e.pointerId); }
  function editorPointerUp(e){ if(!editorCanvas) return; isDragging = false; lastPointer = null; try{ editorCanvas.releasePointerCapture && editorCanvas.releasePointerCapture(e.pointerId);}catch(_){} }
  function editorPointerMove(e){ if(!isDragging || !origImg) return; const p = getPointerPos(e); const dx = p.x - lastPointer.x; const dy = p.y - lastPointer.y; lastPointer = p;
    const target = +innerSizeNum.value || +innerSize.value || 100; const drawSize = Math.min(editorCanvas.width, editorCanvas.height) - 8;
    // editor pixel -> source pixel delta
    const srcDeltaX = dx * (target / drawSize) / (crop.baseScale * crop.zoom);
    const srcDeltaY = dy * (target / drawSize) / (crop.baseScale * crop.zoom);
    crop.centerX += srcDeltaX; crop.centerY += srcDeltaY;
    const sx = origImg.naturalWidth; const sy = origImg.naturalHeight; const currentScale = crop.baseScale * (crop.zoom || 1);
    const srcW = target / currentScale; const srcH = target / currentScale;
    crop.centerX = Math.max(srcW/2, Math.min(crop.centerX, sx - srcW/2));
    crop.centerY = Math.max(srcH/2, Math.min(crop.centerY, sy - srcH/2));
    generateInnerFromOrig();
  }

  if(editorCanvas){
    editorCanvas.addEventListener('pointerdown', editorPointerDown);
    window.addEventListener('pointerup', editorPointerUp);
    editorCanvas.addEventListener('pointermove', editorPointerMove);

    // touch handlers: support pinch zoom and two-finger pan on mobile
    editorCanvas.addEventListener('touchstart', e=>{
      if(e.touches.length === 1){ editorPointerDown(e); }
      else if(e.touches.length >= 2){
        pinch.active = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
        pinch.startDist = Math.hypot(dx,dy);
        pinch.startZoom = crop.zoom || 1;
        pinch.startMid = { x: (t0.clientX + t1.clientX)/2, y: (t0.clientY + t1.clientY)/2 };
        e.preventDefault();
      }
    }, {passive:false});

    editorCanvas.addEventListener('touchmove', e=>{
      if(pinch.active && e.touches.length >= 2){
        const t0 = e.touches[0], t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
        const dist = Math.hypot(dx,dy);
        const factor = dist / (pinch.startDist || 1);
        crop.zoom = Math.max(0.5, Math.min(5, pinch.startZoom * factor));
        if(zoom) zoom.value = Math.round(crop.zoom * 100); if(zoomNum) zoomNum.value = Math.round(crop.zoom * 100);

        // handle midpoint movement -> pan
        const mid = { x: (t0.clientX + t1.clientX)/2, y: (t0.clientY + t1.clientY)/2 };
        const mdx = mid.x - pinch.startMid.x; const mdy = mid.y - pinch.startMid.y;
        // convert editor-mid delta to source pixel delta
        const target = +innerSizeNum.value || +innerSize.value || 100;
        const drawSize = Math.min(editorCanvas.width, editorCanvas.height) - 8;
        const srcDeltaX = mdx * (target / drawSize) / (crop.baseScale * crop.zoom);
        const srcDeltaY = mdy * (target / drawSize) / (crop.baseScale * crop.zoom);
        crop.centerX += srcDeltaX; crop.centerY += srcDeltaY;

        pinch.startMid = mid;
        generateInnerFromOrig(); updateEditor();
        e.preventDefault();
      } else if(e.touches.length === 1){
        editorPointerMove(e);
      }
    }, {passive:false});

    editorCanvas.addEventListener('touchend', e=>{
      if(pinch.active){ pinch.active = false; }
      else { editorPointerUp(e); }
    });
  }

  // Prevent clicks on editorCanvas from triggering underlying file input
  if(editorCanvas){
    editorCanvas.addEventListener('click', e=>{ e.stopPropagation(); });
    editorCanvas.addEventListener('pointerdown', e=>{ e.stopPropagation(); });
    // mouse wheel -> zoom
    editorCanvas.addEventListener('wheel', e=>{
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = 1 + (delta > 0 ? 0.06 : -0.06);
      crop.zoom = Math.max(0.5, Math.min(5, (crop.zoom || 1) * factor));
      if(zoom) zoom.value = Math.round(crop.zoom * 100); if(zoomNum) zoomNum.value = Math.round(crop.zoom * 100);
      generateInnerFromOrig(); updateEditor();
    }, {passive:false});
  }

  // zoom 控件
  const zoom = document.getElementById('zoom'); const zoomNum = document.getElementById('zoomNum');
  if(zoom && zoomNum){ zoom.addEventListener('input', e=>{ zoomNum.value = e.target.value; crop.zoom = e.target.value/100; generateInnerFromOrig(); }); zoomNum.addEventListener('input', e=>{ zoom.value = e.target.value; crop.zoom = e.target.value/100; generateInnerFromOrig(); }); }
  const resetCropBtn = document.getElementById('resetCrop'); if(resetCropBtn){ resetCropBtn.addEventListener('click', ()=>{ if(!origImg) return; crop.zoom = 1; crop.centerX = Math.round(origImg.naturalWidth/2); crop.centerY = Math.round(origImg.naturalHeight/2); if(zoom) zoom.value = 100; if(zoomNum) zoomNum.value = 100; generateInnerFromOrig(); }); }

  // controls sync
  innerSize.addEventListener('input', e=>{ innerSizeNum.value = e.target.value; generateInnerFromOrig(); updateEditor(); });
  innerSizeNum.addEventListener('input', e=>{ innerSize.value = e.target.value; generateInnerFromOrig(); updateEditor(); });
  const fillModeSelect = document.getElementById('fillMode'); if(fillModeSelect){ fillModeSelect.addEventListener('change', ()=>{ generateInnerFromOrig(); updateEditor(); }); }
  [canvasW, canvasH, transparent, bgColor].forEach(el=>el.addEventListener('input', draw));

  // background color control enable/disable
  function updateBgColorState(){ bgColor.disabled = transparent.checked; }
  transparent.addEventListener('change', ()=>{ updateBgColorState(); draw(); });
  updateBgColorState();

  // download
  downloadBtn.addEventListener('click', async ()=>{
    const mime = format.value || 'image/png';
    mainCanvas.toBlob(blob=>{
      if(!blob){ alert('导出失败'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `image.${mime.includes('webp')? 'webp' : 'png'}`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }, mime, 0.92);
  });

  // copy as PNG to clipboard
  copyBtn.addEventListener('click', async ()=>{
    try{
      mainCanvas.toBlob(async blob =>{
        if(!blob) { alert('复制失败'); return; }
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        alert('已复制为 PNG 到剪贴板');
      }, 'image/png');
    }catch(err){ alert('复制失败：浏览器不支持或未授权'); }
  });

  resetBtn.addEventListener('click', ()=>{ reset(); });

  // expose some helpful defaults
  window.addEventListener('load', ()=>{ draw(); });
})();
