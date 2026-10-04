// In-page document viewer: opens a product's documents over the current page, in the same tab.
// With the local demo server running, documents come from its copies (instant, works offline).
// On a static host such as GitHub Pages they are shown straight from the manufacturer's site.

// Resolves to true when the demo server (photo detector, local documents) is reachable.
export const backend = fetch('api/info')
  .then((r) => r.ok && (r.headers.get('content-type') || '').includes('json'))
  .catch(() => false);

let root = null, frame = null, tabs = null, title = null, external = null;

function build() {
  root = document.createElement('div');
  root.id = 'docviewer';
  root.hidden = true;
  root.innerHTML = `
    <div class="dv-bar">
      <div class="dv-title"></div>
      <div class="dv-tabs" role="tablist"></div>
      <a class="dv-source" target="_blank" rel="noopener">Source</a>
      <button class="dv-close" aria-label="Close document">× Close</button>
    </div>
    <iframe class="dv-frame" title="Document"></iframe>`;
  document.body.appendChild(root);
  frame = root.querySelector('.dv-frame');
  tabs = root.querySelector('.dv-tabs');
  title = root.querySelector('.dv-title');
  external = root.querySelector('.dv-source');
  root.querySelector('.dv-close').addEventListener('click', closeDocuments);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) closeDocuments(); });
}

async function show(doc, button) {
  for (const b of tabs.children) b.classList.toggle('active', b === button);
  const local = (await backend) && doc.doc_id;
  frame.src = `${local ? `api/document/${encodeURIComponent(doc.doc_id)}` : doc.embed_url || doc.url}#view=FitH`;
  external.href = doc.url;
}

export function openDocuments(productName, documents, start = 0) {
  if (!documents.length) return false;
  if (!root) build();
  title.textContent = productName;
  tabs.replaceChildren(...documents.map((doc) => {
    const b = document.createElement('button');
    b.textContent = doc.title;
    b.addEventListener('click', () => show(doc, b));
    return b;
  }));
  root.hidden = false;
  document.documentElement.classList.add('dv-open');
  show(documents[start], tabs.children[start]);
  return true;
}

export function closeDocuments() {
  root.hidden = true;
  frame.src = 'about:blank';
  document.documentElement.classList.remove('dv-open');
}
