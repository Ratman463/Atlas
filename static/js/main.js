/* ============================================================
   知图 · frontend logic
   ============================================================ */

const API = '/api';

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** i18n translate — uses AtlasI18n if available, falls back to key. */
const t = (key, vars) => (window.AtlasI18n ? window.AtlasI18n.t(key, vars) : key);

function escapeHtml(s) {
    return String(s).replace(
        /[&<>"']/g,
        (c) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c]
    );
}

function toast(msg, type = '') {
    const stack = $('#toast-stack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity .3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 2600);
}

/* ============================================================
   Settings (localStorage)
   ============================================================ */
const SETTINGS_KEY = '知图.settings.v1';
const defaultSettings = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: '',
    temperature: 0.4,
    maxTokens: 4096,
    topK: 5,
    systemPrompt: '',
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...defaultSettings };
        return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
        return { ...defaultSettings };
    }
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function isConfigured() {
    const s = loadSettings();
    return !!(s.endpoint && s.apiKey && s.model);
}

function fillModelList(models) {
    // Fill the <datalist> so the user can pick, but the input stays editable.
    const datalist = $('#cfg-model-options');
    datalist.innerHTML = (models || []).map((m) => `<option value="${escapeHtml(m)}">`).join('');
}

function fillSettingsForm() {
    const s = loadSettings();
    $('#cfg-endpoint').value = s.endpoint;
    $('#cfg-api-key').value = s.apiKey;
    $('#cfg-model').value = s.model || '';
    $('#cfg-temperature').value = s.temperature;
    $('#cfg-max-tokens').value = s.maxTokens;
    $('#cfg-top-k').value = s.topK;
    $('#cfg-system-prompt').value = s.systemPrompt || '';
    // Don't clobber datalist on every open; only refill if empty.
    if (!$('#cfg-model-options').children.length) fillModelList([]);
}

// Fetch the model list from the user's endpoint (GET {base}/models)
async function fetchModels() {
    const endpoint = $('#cfg-endpoint').value.trim();
    const apiKey = $('#cfg-api-key').value.trim();
    if (!endpoint || !apiKey) {
        toast(t('ask.error.fetch.models.first'), 'error');
        return;
    }
    const btn = $('#fetch-models');
    const original = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + t('ask.fetching');
    try {
        const r = await fetch(`${API}/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint, api_key: apiKey }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
        fillModelList(j.models);
        toast(t('kb.upload.count', { n: j.count }), 'success');
    } catch (e) {
        toast(t('kb.upload.fetch.fail', { msg: e.message }), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

// Ping the endpoint with a 1-token completion to verify the credentials.
async function testConnection() {
    const endpoint = $('#cfg-endpoint').value.trim();
    const apiKey = $('#cfg-api-key').value.trim();
    const model = $('#cfg-model').value.trim();
    if (!endpoint || !apiKey) {
        toast(t('ask.error.fetch.models.first'), 'error');
        return;
    }
    if (!model) {
        toast(t('ask.error.need.model'), 'error');
        return;
    }
    const btn = $('#test-connection');
    const original = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + t('ask.testing');
    try {
        const r = await fetch(`${API}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint, api_key: apiKey, model }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
        toast(t('ask.conn.ok', { msg: j.message || 'OK' }), 'success');
    } catch (e) {
        toast(t('ask.conn.fail', { msg: e.message }), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

function bindSettingsModal() {
    $('#open-settings').addEventListener('click', () => {
        fillSettingsForm();
        $('#settings-modal').hidden = false;
    });
    $('#close-settings').addEventListener('click', () => ($('#settings-modal').hidden = true));

    $('#fetch-models').addEventListener('click', fetchModels);
    $('#test-connection').addEventListener('click', testConnection);

    $('#save-settings').addEventListener('click', () => {
        const s = {
            endpoint: $('#cfg-endpoint').value.trim(),
            apiKey: $('#cfg-api-key').value.trim(),
            model: $('#cfg-model').value.trim(),
            temperature: parseFloat($('#cfg-temperature').value) || 0.4,
            maxTokens: parseInt($('#cfg-max-tokens').value, 10) || 4096,
            topK: parseInt($('#cfg-top-k').value, 10) || 5,
            systemPrompt: ($('#cfg-system-prompt').value || '').trim(),
        };
        if (!s.endpoint || !s.apiKey || !s.model) {
            toast(t('ask.error.save.all'), 'error');
            return;
        }
        saveSettings(s);
        $('#settings-modal').hidden = true;
        toast(t('ask.saved'), 'success');
    });

    $('#reset-settings').addEventListener('click', () => {
        if (!confirm(t('ask.clear.confirm2'))) return;
        localStorage.removeItem(SETTINGS_KEY);
        fillSettingsForm();
        toast(t('ask.cleared'), 'success');
    });
}

/* ============================================================
   Tabs
   ============================================================ */
function bindTabs() {
    $$('.nav-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            $$('.nav-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
            $$('.tab').forEach((s) => s.classList.toggle('is-active', s.dataset.tab === name));
        });
    });
    $('.nav-logo').addEventListener('click', (e) => {
        e.preventDefault();
        $('.nav-tab[data-tab="knowledge"]').click();
    });
}

/* ============================================================
   Knowledge: upload + list + delete
   ============================================================ */
function bindUpload() {
    const dz = $('#dropzone');
    const input = $('#file-input');

    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => {
        e.preventDefault();
        dz.classList.add('is-dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', () => {
        if (input.files?.length) uploadFiles(input.files);
    });
}

async function uploadFiles(fileList) {
    const status = $('#upload-status');
    const files = Array.from(fileList);
    status.hidden = false;
    let ok = 0,
        fail = 0;

    for (const f of files) {
        status.className = 'upload-status info';
        status.textContent = t('kb.upload.processing', { name: f.name });
        const fd = new FormData();
        fd.append('file', f);
        try {
            const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j.detail || t('kb.upload.fail'));
            ok++;
        } catch (e) {
            fail++;
            status.className = 'upload-status error';
            status.textContent = t('kb.upload.fail.item', { name: f.name, msg: e.message });
            await loadDocs();
            return;
        }
    }

    status.className = 'upload-status success';
    status.textContent = fail
        ? t('kb.upload.done.withfail', { n: ok, m: fail })
        : t('kb.upload.done', { n: ok });
    toast(t('kb.upload.done', { n: ok }), 'success');
    await loadDocs();
}

async function loadDocs() {
    const list = $('#docs-list');
    const meta = $('#docs-meta');
    try {
        const r = await fetch(`${API}/documents`);
        const docs = await r.json();
        if (!docs.length) {
            list.innerHTML = '<div class="empty">' + escapeHtml(t('kb.list.empty')) + '</div>';
            meta.textContent = '0 ' + t('kb.list.unit');
            return;
        }
        const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);
        meta.textContent = `${docs.length} ${t('kb.list.unit')} · ${totalChunks} ${t('kb.list.unit.chunks')}`;
        const unitChunks = t('kb.list.unit.chunks');
        list.innerHTML = docs
            .map((d) => {
                const ext = (d.filename.split('.').pop() || 'doc').slice(0, 4);
                const size = `${d.chunk_count} ${unitChunks} · ${new Date(d.created_at).toLocaleString()}`;
                return `
              <div class="doc-row">
                <span class="doc-icon">${escapeHtml(ext)}</span>
                <div class="doc-meta-main">
                    <div class="doc-name">${escapeHtml(d.filename)}</div>
                    <div class="doc-sub">${escapeHtml(size)}</div>
                </div>
                <button class="doc-del" data-name="${escapeHtml(d.filename)}">${escapeHtml(t('kb.doc.delete'))}</button>
              </div>`;
            })
            .join('');
        $$('.doc-del').forEach((btn) =>
            btn.addEventListener('click', () => deleteDoc(btn.dataset.name))
        );
    } catch (e) {
        list.innerHTML = `<div class="empty">${escapeHtml(t('kb.list.empty.fail', { msg: e.message }))}</div>`;
    }
}

async function deleteDoc(name) {
    if (!confirm(t('kb.doc.delete.confirm', { name }))) return;
    try {
        const r = await fetch(`${API}/documents/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error((await r.json()).detail || t('kb.doc.delete.fail'));
        toast(t('kb.doc.deleted'), 'success');
        await loadDocs();
    } catch (e) {
        toast(e.message, 'error');
    }
}

/* ============================================================
   Minimal Markdown renderer (no external deps)
   ============================================================ */
function renderMarkdown(md) {
    // Escape first
    let s = escapeHtml(md);
    // Code blocks ```...```
    s = s.replace(
        /```([\s\S]*?)```/g,
        (_, code) => `<pre><code>${code.replace(/^\n/, '')}</code></pre>`
    );
    // Inline code
    s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    // Headings
    s = s
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold / italic
    s = s
        .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    // Links [text](url)
    s = s.replace(
        /\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    // Blockquote
    s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Tables
    s = s.replace(/((?:^\|.*\|\s*\n)+)/gm, (table) => {
        const lines = table.trim().split('\n');
        if (lines.length < 2) return table;
        const cells = (line) =>
            line
                .replace(/^\||\|$/g, '')
                .split('|')
                .map((c) => c.trim());
        const head = cells(lines[0]);
        const body = lines.slice(2).map(cells);
        let html =
            '<table><thead><tr>' +
            head.map((c) => `<th>${c}</th>`).join('') +
            '</tr></thead><tbody>';
        for (const row of body) {
            html += '<tr>' + row.map((c, i) => `<td>${c || ''}</td>`).join('') + '</tr>';
        }
        return html + '</tbody></table>';
    });
    // Lists & paragraphs
    const lines = s.split('\n');
    const out = [];
    let inUl = false,
        inOl = false,
        para = [];

    const flushPara = () => {
        if (para.length) {
            out.push('<p>' + para.join(' ') + '</p>');
            para = [];
        }
    };
    const closeLists = () => {
        if (inUl) {
            out.push('</ul>');
            inUl = false;
        }
        if (inOl) {
            out.push('</ol>');
            inOl = false;
        }
    };

    for (const ln of lines) {
        const t = ln.trim();
        if (!t) {
            flushPara();
            closeLists();
            continue;
        }
        if (
            /^<h[123]>/.test(t) ||
            /^<pre>/.test(t) ||
            /^<blockquote>/.test(t) ||
            /^<table>/.test(t)
        ) {
            flushPara();
            closeLists();
            out.push(t);
            continue;
        }
        const ul = t.match(/^[-*]\s+(.+)$/);
        const ol = t.match(/^\d+\.\s+(.+)$/);
        if (ul) {
            flushPara();
            if (inOl) {
                out.push('</ol>');
                inOl = false;
            }
            if (!inUl) {
                out.push('<ul>');
                inUl = true;
            }
            out.push('<li>' + ul[1] + '</li>');
        } else if (ol) {
            flushPara();
            if (inUl) {
                out.push('</ul>');
                inUl = false;
            }
            if (!inOl) {
                out.push('<ol>');
                inOl = true;
            }
            out.push('<li>' + ol[1] + '</li>');
        } else {
            closeLists();
            para.push(t);
        }
    }
    flushPara();
    closeLists();
    return out.join('\n');
}

/* ============================================================
   Chat (streaming via SSE)
   ============================================================ */
const chatHistory = []; // {role, content}

function bindChat() {
    const form = $('#chat-form');
    const input = $('#chat-input');
    const empty = $('#chat-empty');
    const thread = $('#chat-thread');

    // Auto-grow textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    // Suggestion chips
    $$('.chip').forEach((c) =>
        c.addEventListener('click', () => {
            input.value = c.dataset.q;
            form.requestSubmit();
        })
    );

    // Clear conversation
    const clearBtn = $('#clear-chat');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!confirm(t('ask.clear.confirm'))) return;
            chatHistory.length = 0;
            const thread = $('#chat-thread');
            thread.innerHTML = '';
            thread.innerHTML = `
                <div class="chat-empty" id="chat-empty">
                    <div class="chat-empty-icon">${escapeHtml(t('ask.empty.icon'))}</div>
                    <p>${escapeHtml(t('ask.empty.tip'))}</p>
                    <div class="chat-suggest">
                        <button class="chip" data-q="${escapeHtml(t('ask.chip.1.q'))}">${escapeHtml(t('ask.chip.1.label'))}</button>
                        <button class="chip" data-q="${escapeHtml(t('ask.chip.2.q'))}">${escapeHtml(t('ask.chip.2.label'))}</button>
                        <button class="chip" data-q="${escapeHtml(t('ask.chip.3.q'))}">${escapeHtml(t('ask.chip.3.label'))}</button>
                    </div>
                </div>`;
            $$('.chip').forEach((c) =>
                c.addEventListener('click', () => {
                    input.value = c.dataset.q;
                    form.requestSubmit();
                })
            );
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;

        if (!isConfigured()) {
            toast(t('ask.need.config'), 'error');
            $('#open-settings').click();
            return;
        }

        if (empty) empty.remove();

        const useKb = $('#use-knowledge-chat').checked;
        const s = loadSettings();

        // Append user msg
        appendMsg('user', q);
        chatHistory.push({ role: 'user', content: q });

        // AI placeholder
        const ai = appendMsg('ai', '');
        const bubble = ai.querySelector('.msg-bubble');
        bubble.classList.add('msg-cursor');
        bubble.innerHTML = '<span class="spinner"></span>';

        input.value = '';
        input.style.height = 'auto';
        $('#chat-send').disabled = true;

        let buf = '';
        let sources = null;
        try {
            const resp = await fetch(`${API}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: q,
                    top_k: s.topK,
                    history: chatHistory.slice(-10, -1), // exclude the just-pushed user msg
                    use_knowledge: useKb,
                    temperature: s.temperature,
                    max_tokens: s.maxTokens,
                    system_prompt: s.systemPrompt || null,
                    api_key: s.apiKey,
                    endpoint: s.endpoint,
                    model: s.model,
                }),
            });

            if (!resp.ok) {
                let detail = '';
                try {
                    detail = (await resp.json()).detail;
                } catch {}
                throw new Error(detail || `HTTP ${resp.status}`);
            }

            const reader = resp.body.getReader();
            const dec = new TextDecoder('utf-8');
            let raw = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                raw += dec.decode(value, { stream: true });
                let idx;
                while ((idx = raw.indexOf('\n\n')) !== -1) {
                    const chunk = raw.slice(0, idx);
                    raw = raw.slice(idx + 2);
                    const evt = parseSSE(chunk);
                    if (!evt) continue;
                    if (evt.event === 'delta') {
                        buf += evt.data.content;
                        bubble.classList.remove('msg-cursor');
                        bubble.innerHTML = renderMarkdown(buf);
                    } else if (evt.event === 'context') {
                        // we don't know the actual sources yet; UI shows count later if needed
                    } else if (evt.event === 'done') {
                        if (evt.data.error) throw new Error(evt.data.error);
                    }
                }
            }

            if (!buf) {
                bubble.classList.remove('msg-cursor');
                bubble.innerHTML = '<span class="empty" style="padding:8px;">' + escapeHtml(t('ask.empty.reply')) + '</span>';
            }
            chatHistory.push({ role: 'assistant', content: buf });

            // Sources panel (re-query to display the actual chunks used)
            if (useKb) {
                try {
                    const r = await fetch(`${API}/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ question: q, top_k: s.topK }),
                    });
                    const j = await r.json();
                    if (j.results?.length) attachSources(ai, j.results);
                } catch {}
            }
        } catch (e) {
            bubble.classList.remove('msg-cursor');
            bubble.innerHTML = `<span style="color:var(--danger);">⚠ ${escapeHtml(e.message)}</span>`;
        } finally {
            $('#chat-send').disabled = false;
            input.focus();
            thread.scrollTop = thread.scrollHeight;
        }
    });
}

function appendMsg(role, text) {
    const thread = $('#chat-thread');
    const wrap = document.createElement('div');
    wrap.className = `msg msg-${role}`;
    const roleLabel = role === 'user' ? t('ask.role.user') : t('ask.role.ai');
    wrap.innerHTML = `
      <div class="msg-role">${escapeHtml(roleLabel)}</div>
      <div class="msg-bubble">${role === 'user' ? escapeHtml(text).replace(/\n/g, '<br>') : ''}</div>
    `;
    thread.appendChild(wrap);
    thread.scrollTop = thread.scrollHeight;
    return wrap;
}

function attachSources(msgEl, results) {
    const details = document.createElement('details');
    details.className = 'msg-sources';
    details.innerHTML = `
      <summary>${escapeHtml(t('ask.sources.summary', { n: results.length }))}</summary>
      ${results
          .map(
              (r) => `
        <div class="src-item">
          <div class="src-name">${escapeHtml(r.filename)} · ${escapeHtml(t('ask.source.similarity', { pct: (r.similarity * 100).toFixed(0) }))}</div>
          <div class="src-text">${escapeHtml(r.content).slice(0, 240)}${r.content.length > 240 ? '…' : ''}</div>
        </div>`
          )
          .join('')}
    `;
    msgEl.appendChild(details);
}

function parseSSE(chunk) {
    let event = 'message',
        dataStr = '';
    for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
    }
    if (!dataStr) return null;
    try {
        return { event, data: JSON.parse(dataStr) };
    } catch {
        return null;
    }
}

/* ============================================================
   Document generation
   ============================================================ */
function bindGenerate() {
    const form = $('#gen-form');
    const previewBtn = $('#gen-preview-btn');
    const status = $('#gen-status');

    async function gatherPayload(forPreview) {
        const s = loadSettings();
        if (!isConfigured()) {
            toast(t('ask.need.config'), 'error');
            $('#open-settings').click();
            return null;
        }
        return {
            title: $('#gen-title').value.trim() || t('gen.fallback.title'),
            prompt: $('#gen-prompt').value.trim(),
            top_k: s.topK,
            use_knowledge: $('#use-knowledge-gen').checked,
            temperature: s.temperature,
            max_tokens: s.maxTokens,
            system_prompt: s.systemPrompt || null,
            api_key: s.apiKey,
            endpoint: s.endpoint,
            model: s.model,
        };
    }

    previewBtn.addEventListener('click', async () => {
        const body = await gatherPayload(true);
        if (!body) return;
        if (!body.prompt) {
            toast(t('gen.need.prompt'), 'error');
            return;
        }
        const pv = $('#gen-preview');
        pv.innerHTML = '<div class="empty"><span class="spinner"></span> ' + escapeHtml(t('gen.drafting')) + '</div>';
        status.textContent = t('gen.status.gen');
        try {
            const r = await fetch(`${API}/generate-doc-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.detail || t('gen.preview.fail'));
            pv.innerHTML = renderMarkdown(j.markdown);
            $('#gen-preview-meta').textContent = t('gen.meta.chars', { n: j.markdown.length });
            status.textContent = t('gen.status.drafted');
            toast(t('gen.preview.ok'), 'success');
        } catch (e) {
            pv.innerHTML = `<div class="empty" style="color:var(--danger);">${escapeHtml(e.message)}</div>`;
            status.textContent = t('gen.status.fail');
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = await gatherPayload(false);
        if (!body) return;
        if (!body.prompt) {
            toast(t('gen.need.prompt'), 'error');
            return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        const original = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span> ' + escapeHtml(t('gen.status.gen'));
        status.textContent = t('gen.status.word');
        try {
            const r = await fetch(`${API}/generate-doc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!r.ok) {
                let detail = '';
                try {
                    detail = (await r.json()).detail;
                } catch {}
                throw new Error(detail || `HTTP ${r.status}`);
            }
            const blob = await r.blob();
            // Pull filename from Content-Disposition
            const cd = r.headers.get('Content-Disposition') || '';
            const m = cd.match(/filename="?([^"]+)"?/);
            const filename = m ? m[1] : `${body.title}.docx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            status.textContent = t('gen.status.downloaded', { name: filename });
            toast(t('gen.toast.downloaded'), 'success');

            // Also update preview from the same response if possible
            // (Server returns docx bytes; preview stays as-is unless we re-call preview)
        } catch (e) {
            status.textContent = t('gen.status.fail');
            toast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    });
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // i18n init (must run before any UI strings render).
    // AtlasI18n loads via defer alongside main.js; if not yet ready, defer slightly.
    const startBoot = () => {
        if (window.AtlasI18n && AtlasI18n.initSwitcher) {
            AtlasI18n.initSwitcher();
        }

        bindTabs();
        bindSettingsModal();
        bindUpload();
        bindChat();
        bindGenerate();
        loadDocs();

        // Deep-link: ?view=ask|generate|knowledge and/or ?settings=1
        try {
            const params = new URLSearchParams(location.search);
            const view = params.get('view');
            if (view && ['knowledge', 'ask', 'generate'].includes(view)) {
                const tab = document.querySelector(`.nav-tab[data-tab="${view}"]`);
                if (tab) tab.click();
            }
            if (params.get('settings') === '1' || params.get('settings') === 'true') {
                $('#open-settings').click();
            }
        } catch (e) {
            /* ignore */
        }

        if (!isConfigured()) {
            setTimeout(() => {
                toast(t('ask.boot.hint'), '');
            }, 600);
        }

        // Re-apply language whenever it changes (in case dynamic DOM was generated between).
        window.addEventListener('langchange', () => {
            // The chat chips & suggestion buttons use dynamic data-q; refresh current empty state if present.
            const chatEmpty = document.getElementById('chat-empty');
            if (chatEmpty) {
                chatEmpty.querySelector('.chat-empty-icon').textContent = t('ask.empty.icon');
                chatEmpty.querySelector('p').textContent = t('ask.empty.tip');
                const chips = chatEmpty.querySelectorAll('.chip');
                const labels = [t('ask.chip.1.label'), t('ask.chip.2.label'), t('ask.chip.3.label')];
                const qs = [t('ask.chip.1.q'), t('ask.chip.2.q'), t('ask.chip.3.q')];
                chips.forEach((c, i) => {
                    if (labels[i]) c.textContent = labels[i];
                    if (qs[i]) c.setAttribute('data-q', qs[i]);
                });
            }
        });
    };

    if (window.AtlasI18n) {
        startBoot();
    } else {
        // i18n.js is deferred & loaded before main.js; this branch is rare.
        window.addEventListener('load', startBoot);
    }
});
