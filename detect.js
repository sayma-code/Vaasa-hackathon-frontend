import { openDocuments } from './docviewer.js?v=9';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), input = $('file'), status = $('status');
let current = null; // last server response

function say(text, isError = false) {
  status.hidden = !text;
  status.textContent = text || '';
  status.classList.toggle('error', isError);
}

const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const NOT_RUNNING = location.protocol === 'file:'
  ? 'This page was opened as a file, so it cannot reach the detector. Start the demo (start_demo.bat) and open http://localhost:8765/detect.html instead.'
  : LOCAL
    ? 'The detector is not running. Start the demo (start_demo.bat) and reload this page.'
    : 'The photo detector runs only in the local demo, because it needs the detector program and a graphics card. The 3D twin works here.';

async function showTrained() {
  try {
    const info = await (await fetch('api/info')).json();
    $('trained').textContent = `Trained to find: ${info.products.map((p) => p.name).join(', ')}.`;
  } catch {
    say(NOT_RUNNING, true);
  }
}

async function submit(file) {
  if (!file) return say('No image file was received. Drag a photo from a folder on this computer, or click the box to choose one.', true);
  if (!file.type.startsWith('image/')) return say('That file is not an image.', true);
  $('result').hidden = true;
  drop.hidden = true;
  say('Looking for products in the photo…');
  const body = new FormData();
  body.append('file', file);
  try {
    let res;
    try {
      res = await fetch('api/detect', { method: 'POST', body });
    } catch {
      throw new Error(NOT_RUNNING);
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || 'The photo could not be analysed.');
    current = json;
    URL.revokeObjectURL($('photo').src);
    $('photo').src = URL.createObjectURL(file);
    $('result').hidden = false;
    say('');
    draw();
  } catch (err) {
    drop.hidden = false;
    say(err.message, true);
  }
}

function evidence(d) {
  if (d.text_found === null) return 'Text on the device was too small to read.';
  if (d.text_found.length) return `Text read on the device: ${d.text_found.join(', ')}.`;
  return `Expected text (${d.text_expected.join(', ')}) could not be read.`;
}

const TAG_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 5h13a3 3 0 0 1 3 3v13a3 3 0 0 1-.9 2.1L23.6 41.6a3 3 0 0 1-4.2 0L6.4 28.6a3 3 0 0 1 0-4.2L24.9 5.9A3 3 0 0 1 27 5z" fill="#d1344b" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="34.5" cy="13.5" r="3.6" fill="#fff"/></svg>`;

// Clicking a tag opens the product's documentation over this page, in the same tab.
function openDocs(d, start = 0) {
  if (!openDocuments(d.product, d.documents, start)) say('No documentation is linked to this product.', true);
}

function draw() {
  const min = Number($('conf').value) / 100;
  $('conf-value').textContent = `${Math.round(min * 100)}%`;
  const shown = current.detections.filter((d) => d.confidence >= min);
  const hidden = current.detections.length - shown.length;

  $('headline').textContent = shown.length
    ? `${shown.length} ${shown.length === 1 ? 'product' : 'products'} found`
    : 'No products found';
  $('meta').textContent = `${current.width} × ${current.height} px, analysed in ${current.seconds} s`
    + (hidden ? `. ${hidden} weaker ${hidden === 1 ? 'match is' : 'matches are'} hidden; lower the slider to see ${hidden === 1 ? 'it' : 'them'}.` : '.');

  const boxes = $('boxes'), list = $('found');
  boxes.replaceChildren();
  list.replaceChildren();
  const weaker = $('weaker');
  if (weaker) weaker.hidden = !(hidden && !shown.length);
  if (weaker && !weaker.hidden) {
    const best = Math.max(...current.detections.map((d) => d.confidence));
    weaker.textContent = `Show the best weaker match (${Math.round(best * 100)}%) and its documentation`;
    weaker.onclick = () => { $('conf').value = Math.max(10, Math.floor(best * 20) * 5); draw(); };
  }
  shown.forEach((d, i) => {
    const [x1, y1, x2, y2] = d.box;
    const box = document.createElement('div');
    box.className = 'box';
    box.style.left = `${(x1 / current.width) * 100}%`;
    box.style.top = `${(y1 / current.height) * 100}%`;
    box.style.width = `${((x2 - x1) / current.width) * 100}%`;
    box.style.height = `${((y2 - y1) / current.height) * 100}%`;
    const tag = document.createElement('span');
    tag.textContent = `${i + 1} · ${Math.round(d.confidence * 100)}%`;
    const pin = document.createElement('button');  // the tag mark inside the box
    pin.className = 'tagmark';
    pin.title = d.documents.length ? `Open: ${d.documents[0].title}` : 'No documentation linked';
    pin.setAttribute('aria-label', `Open documentation for product ${i + 1}`);
    pin.innerHTML = TAG_ICON;
    pin.addEventListener('click', (e) => { e.stopPropagation(); openDocs(d); });
    box.append(tag, pin);
    boxes.appendChild(box);

    const li = document.createElement('li');
    const top = document.createElement('div');
    top.className = 'top';
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${d.product}`;
    const conf = document.createElement('span');
    conf.textContent = `${Math.round(d.confidence * 100)}%`;
    top.append(name, conf);
    const ev = document.createElement('div');
    ev.className = 'evidence';
    ev.textContent = evidence(d);
    const docs = document.createElement('div');
    docs.className = 'docs';
    d.documents.forEach((doc, k) => {
      const a = document.createElement('a');
      a.href = doc.url;
      a.textContent = doc.title;
      a.addEventListener('click', (e) => { e.preventDefault(); openDocs(d, k); });
      docs.appendChild(a);
    });
    const docsTitle = document.createElement('div');
    docsTitle.className = 'docs-title';
    docsTitle.textContent = d.documents.length ? 'Documentation' : 'No documentation is linked to this product.';
    li.append(top, ev, docsTitle, docs);
    const mark = (on) => { box.classList.toggle('active', on); li.classList.toggle('active', on); };
    for (const el of [box, li]) {
      el.addEventListener('mouseenter', () => mark(true));
      el.addEventListener('mouseleave', () => mark(false));
    }
    box.addEventListener('click', () => openDocs(d));  // the whole box works like its tag
    list.appendChild(li);
  });
}

drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', () => { submit(input.files[0]); input.value = ''; });
for (const type of ['dragenter', 'dragover']) {
  document.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('over'); });
}
document.addEventListener('dragleave', () => drop.classList.remove('over'));
document.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); submit(e.dataTransfer.files[0]); });
document.addEventListener('paste', (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (item) submit(item.getAsFile());
});
$('conf').addEventListener('input', () => current && draw());
$('again').addEventListener('click', () => { $('result').hidden = true; drop.hidden = false; say(''); });

showTrained();
