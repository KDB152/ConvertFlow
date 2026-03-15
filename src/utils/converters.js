import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { readPsd, writePsd } from 'ag-psd';
import JSZip from 'jszip';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ═══════════════════════════════════════
// FORMAT DEFINITIONS
// ═══════════════════════════════════════
const FORMAT_ICONS = {
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🎞️', svg: '🎨',
  psd: '🎨', txt: '📃', pdf: '📄', docx: '📝', odt: '📝', pptx: '📊',
};

const FORMAT_LABELS = {
  jpg: 'JPG Image', jpeg: 'JPEG Image', png: 'PNG Image', gif: 'GIF Image',
  svg: 'SVG Image', psd: 'PSD (Photoshop)', txt: 'Text File', pdf: 'PDF Document',
  docx: 'Word Document', odt: 'ODT Document', pptx: 'PowerPoint',
};

const ALL_FORMATS = ['jpg', 'png', 'gif', 'svg', 'psd', 'txt', 'pdf', 'docx', 'odt', 'pptx'];

const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'psd', 'webp', 'bmp'];

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject;
    r.readAsText(file);
  });
}

function baseName(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

function getExt(file) {
  return file.name.split('.').pop().toLowerCase();
}

function toBlob(canvas, mime, q = 0.92) {
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), mime, q));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ═══════════════════════════════════════
// STAGE 1: INPUT → CANVAS  (for image-like outputs)
// ═══════════════════════════════════════
async function fileToCanvas(file) {
  const ext = getExt(file);

  // Standard image formats
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
    const url = await readAsDataURL(file);
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return c;
  }

  // SVG
  if (ext === 'svg') {
    const text = await readAsText(file);
    const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 800;
    c.height = img.naturalHeight || 600;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return c;
  }

  // PSD
  if (ext === 'psd') {
    const buf = await readAsArrayBuffer(file);
    const psd = readPsd(new Uint8Array(buf));
    return psd.canvas; // ag-psd returns a composite canvas
  }

  // PDF → take first page
  if (ext === 'pdf') {
    const buf = await readAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2.0 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  }

  // Text-like → render text on canvas
  const text = await extractText(file);
  return renderTextToCanvas(text);
}

// ═══════════════════════════════════════
// STAGE 1B: INPUT → TEXT  (for document-like outputs)
// ═══════════════════════════════════════
async function extractText(file) {
  const ext = getExt(file);

  if (ext === 'txt') return readAsText(file);

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const buf = await readAsArrayBuffer(file);
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value;
  }

  if (ext === 'odt') {
    const buf = await readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(buf);
    const contentXml = await zip.file('content.xml')?.async('string');
    if (!contentXml) return '';
    // Parse XML and extract text nodes
    const parser = new DOMParser();
    const doc = parser.parseFromString(contentXml, 'application/xml');
    const textNodes = doc.getElementsByTagName('text:p');
    const lines = [];
    for (let i = 0; i < textNodes.length; i++) {
      lines.push(textNodes[i].textContent || '');
    }
    return lines.join('\n');
  }

  if (ext === 'pdf') {
    const buf = await readAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      pages.push(tc.items.map(it => it.str).join(' '));
    }
    return pages.join('\n\n');
  }

  if (ext === 'pptx') {
    const buf = await readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(buf);
    const slides = [];
    let i = 1;
    while (true) {
      const slideFile = zip.file(`ppt/slides/slide${i}.xml`);
      if (!slideFile) break;
      const xml = await slideFile.async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');
      const texts = doc.getElementsByTagName('a:t');
      const slideText = [];
      for (let j = 0; j < texts.length; j++) slideText.push(texts[j].textContent);
      slides.push(slideText.join(' '));
      i++;
    }
    return slides.join('\n\n');
  }

  // For image/PSD - no meaningful text
  return `[Image file: ${file.name}]`;
}

function renderTextToCanvas(text, maxWidth = 800) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '16px Inter, sans-serif';

  const lines = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word;
      if (ctx.measureText(test).width > maxWidth - 60 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }

  c.width = maxWidth;
  c.height = Math.max(100, lines.length * 22 + 60);
  const ctx2 = c.getContext('2d');
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, c.width, c.height);
  ctx2.fillStyle = '#000000';
  ctx2.font = '16px Inter, sans-serif';
  lines.forEach((ln, i) => ctx2.fillText(ln, 30, 30 + i * 22));
  return c;
}

// ═══════════════════════════════════════
// STAGE 2: CANVAS/TEXT → OUTPUT FORMATS
// ═══════════════════════════════════════

// Canvas → JPG
async function canvasToJpg(canvas) {
  const c = ensureWhiteBg(canvas);
  return toBlob(c, 'image/jpeg', 0.92);
}

// Canvas → PNG
async function canvasToPng(canvas) {
  return toBlob(canvas, 'image/png');
}

// Canvas → GIF (using gifenc)
function canvasToGif(canvas) {
  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  const gif = GIFEncoder();
  gif.writeFrame(index, width, height, { palette });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

// Canvas → SVG (raster embedded in SVG)
function canvasToSvg(canvas) {
  const dataUrl = canvas.toDataURL('image/png');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" xlink:href="${dataUrl}"/>
</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

// Canvas → PSD (single layer via ag-psd)
function canvasToPsd(canvas) {
  const psd = {
    width: canvas.width,
    height: canvas.height,
    children: [{
      name: 'Layer 1',
      canvas: canvas,
    }],
  };
  const buf = writePsd(psd);
  return new Blob([buf], { type: 'application/octet-stream' });
}

// Canvas → PDF
function canvasToPdf(canvas) {
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
  });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pw / canvas.width, ph / canvas.height);
  const w = canvas.width * ratio, h = canvas.height * ratio;
  const x = (pw - w) / 2, y = (ph - h) / 2;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
  return pdf.output('blob');
}

// Canvas → PPTX
async function canvasToPptx(canvas) {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addImage({ data: canvas.toDataURL('image/png'), x: 0, y: 0, w: '100%', h: '100%' });
  const data = await pptx.write({ outputType: 'arraybuffer' });
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// Text → DOCX
async function textToDocx(text) {
  const paragraphs = text.split('\n').map(line =>
    new Paragraph({ children: [new TextRun({ text: line, size: 22 })] })
  );
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}

// Text → ODT (using JSZip)
async function textToOdt(text) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');

  zip.file('META-INF/manifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
</manifest:manifest>`);

  const escapedParagraphs = text.split('\n').map(line => {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<text:p text:style-name="P1">${escaped}</text:p>`;
  }).join('\n');

  zip.file('content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:automatic-styles>
    <style:style style:name="P1" style:family="paragraph">
      <style:paragraph-properties fo:margin-bottom="0.2cm"/>
      <style:text-properties fo:font-size="11pt" style:font-name="Arial"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      ${escapedParagraphs}
    </office:text>
  </office:body>
</office:document-content>`);

  zip.file('styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
</office:document-styles>`);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' });
}

// Text → PDF
function textToPdf(text) {
  const pdf = new jsPDF();
  pdf.setFontSize(11);
  const lines = pdf.splitTextToSize(text, pdf.internal.pageSize.getWidth() - 30);
  const pageH = pdf.internal.pageSize.getHeight();
  let y = 15;
  for (const line of lines) {
    if (y > pageH - 15) { pdf.addPage(); y = 15; }
    pdf.text(line, 15, y);
    y += 6;
  }
  return pdf.output('blob');
}

// Text → PPTX
async function textToPptx(text) {
  const pptx = new PptxGenJS();
  const chunks = text.split('\n\n');
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const slide = pptx.addSlide();
    slide.addText(chunk.trim(), {
      x: 0.5, y: 0.5, w: '90%', h: '85%',
      fontSize: 14, color: '333333', valign: 'top',
    });
  }
  if (pptx.slides.length === 0) {
    const slide = pptx.addSlide();
    slide.addText(text || '(empty)', { x: 0.5, y: 0.5, w: '90%', h: '85%', fontSize: 14 });
  }
  const data = await pptx.write({ outputType: 'arraybuffer' });
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// Text → TXT
function textToTxt(text) {
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

// Helper: ensure white background for JPEG
function ensureWhiteBg(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

// ═══════════════════════════════════════
// PDF → multi-page outputs
// ═══════════════════════════════════════
async function pdfToMultiPageImages(file, format, onProgress) {
  const buf = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = pdf.numPages;
  const blobs = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2.0 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;

    let blob;
    switch (format) {
      case 'jpg': case 'jpeg': blob = await canvasToJpg(c); break;
      case 'png': blob = await canvasToPng(c); break;
      case 'gif': blob = canvasToGif(c); break;
      case 'svg': blob = canvasToSvg(c); break;
      case 'psd': blob = canvasToPsd(c); break;
      default: blob = await canvasToPng(c);
    }
    blobs.push(blob);
    onProgress?.((i / total) * 90);
  }
  return { blobs, pageCount: total };
}

// ═══════════════════════════════════════
// DETECT FILE TYPE
// ═══════════════════════════════════════
export function detectFileType(file) {
  let ext = getExt(file);
  // Normalize jpeg → jpg for display
  const normalizedExt = ext === 'jpeg' ? 'jpg' : ext;

  const outputFormats = ALL_FORMATS
    .filter(f => f !== normalizedExt && f !== ext)
    .map(f => ({ id: f, label: f.toUpperCase(), icon: FORMAT_ICONS[f] || '📄' }));

  return {
    type: IMAGE_FORMATS.includes(ext) ? 'image' : ext,
    ext,
    label: FORMAT_LABELS[ext] || ext.toUpperCase() + ' File',
    icon: FORMAT_ICONS[ext] || '📁',
    outputFormats,
  };
}

// ═══════════════════════════════════════
// MASTER CONVERTER
// ═══════════════════════════════════════
export async function convertFile(file, targetFormat, onProgress) {
  const ext = getExt(file);
  const isSourceImage = IMAGE_FORMATS.includes(ext);
  const isTargetImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'psd'].includes(targetFormat);
  const name = baseName(file.name) + '.' + targetFormat;

  onProgress?.(10);

  // ── Special case: PDF → multi-page image output
  if (ext === 'pdf' && isTargetImage) {
    const { blobs, pageCount } = await pdfToMultiPageImages(file, targetFormat, onProgress);
    if (blobs.length === 1) {
      saveAs(blobs[0], name);
    } else {
      blobs.forEach((b, i) => saveAs(b, `${baseName(file.name)}_page${i + 1}.${targetFormat}`));
    }
    onProgress?.(100);
    return { success: true, filename: name, pageCount };
  }

  // ── Image-like target: go through canvas
  if (isTargetImage) {
    onProgress?.(20);
    const canvas = await fileToCanvas(file);
    onProgress?.(60);

    let blob;
    switch (targetFormat) {
      case 'jpg': case 'jpeg': blob = await canvasToJpg(canvas); break;
      case 'png': blob = await canvasToPng(canvas); break;
      case 'gif': blob = canvasToGif(canvas); break;
      case 'svg': blob = canvasToSvg(canvas); break;
      case 'psd': blob = canvasToPsd(canvas); break;
    }
    onProgress?.(90);
    saveAs(blob, name);
    onProgress?.(100);
    return { success: true, filename: name };
  }

  // ── PDF target from image source
  if (targetFormat === 'pdf' && isSourceImage) {
    onProgress?.(20);
    const canvas = await fileToCanvas(file);
    onProgress?.(60);
    const blob = canvasToPdf(canvas);
    onProgress?.(90);
    saveAs(blob, name);
    onProgress?.(100);
    return { success: true, filename: name };
  }

  // ── PPTX target from image source
  if (targetFormat === 'pptx' && isSourceImage) {
    onProgress?.(20);
    const canvas = await fileToCanvas(file);
    onProgress?.(60);
    const blob = await canvasToPptx(canvas);
    onProgress?.(90);
    saveAs(blob, name);
    onProgress?.(100);
    return { success: true, filename: name };
  }

  // ── Text-based targets: extract text first
  onProgress?.(20);
  const text = await extractText(file);
  onProgress?.(50);

  let blob;
  switch (targetFormat) {
    case 'txt':
      blob = textToTxt(text);
      break;
    case 'pdf':
      blob = textToPdf(text);
      break;
    case 'docx':
      blob = await textToDocx(text);
      break;
    case 'odt':
      blob = await textToOdt(text);
      break;
    case 'pptx':
      blob = await textToPptx(text);
      break;
    default:
      throw new Error(`Conversion to ${targetFormat.toUpperCase()} is not supported.`);
  }

  onProgress?.(90);
  saveAs(blob, name);
  onProgress?.(100);
  return { success: true, filename: name };
}
