/* ============================================================
   知图 · frontend logic
   ============================================================ */

const API = '/api';

/* ---------- tiny helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
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
    model: 'gpt-4o-mini',
    temperature: 0.4,
    maxTokens: 4096,
    topK: 5,
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

function fillSettingsForm() {
    const s = loadSettings();
    $('#cfg-endpoint').value    = s.endpoint;
    $('#cfg-api-key').value     = s.apiKey;
    $('#cfg-model').value       = s.model;
    $('#cfg-temperature').value = s.temperature;
    $('#cfg-max-tokens').value  = s.maxTokens;
    $('#cfg-top-k').value       = s.topK;
}

function bindSettingsModal() {
    $('#open-settings').addEventListener('click', () => {
        fillSettingsForm();
        $('#settings-modal').hidden = false;
    });
    $('#close-settings').addEventListener('click', () => $('#settings-modal').hidden = true);
    $('#settings-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.hidden = true;
    });

    $('#save-settings').addEventListener('click', () => {
        const s = {
            endpoint:    $('#cfg-endpoint').value.trim(),
            apiKey:      $('#cfg-api-key').value.trim(),
            model:       $('#cfg-model').value.trim(),
            temperature: parseFloat($('#cfg-temperature').value) || 0.4,
            maxTokens:   parseInt($('#cfg-max-tokens').value, 10) || 4096,
            topK:        parseInt($('#cfg-top-k').value, 10) || 5,
        };
        if (!s.endpoint || !s.apiKey || !s.model) {
            toast('请把 Endpoint / API Key / Model 都填好', 'error');
            return;
        }
        saveSettings(s);
        $('#settings-modal').hidden = true;
        toast('配置已保存', 'success');
    });

    $('#reset-settings').addEventListener('click', () => {
        if (!confirm('清空所有配置？')) return;
        localStorage.removeItem(SETTINGS_KEY);
        fillSettingsForm();
        toast('已清空', 'success');
    });
}

/* ============================================================
   Tabs
   ============================================================ */
function bindTabs() {
    $$('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            $$('.nav-tab').forEach(t => t.classList.toggle('is-active', t === tab));
            $$('.tab').forEach(s => s.classList.toggle('is-active', s.dataset.tab === name));
        });
    });
    $('.nav-logo').addEventListener('click', e => {
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
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', () => { if (input.files?.length) uploadFiles(input.files); });
}

async function uploadFiles(fileList) {
    const status = $('#upload-status');
    const files = Array.from(fileList);
    status.hidden = false;
    let ok = 0, fail = 0;

    for (const f of files) {
        status.className = 'upload-status info';
        status.textContent = `正在处理 ${f.name} …`;
        const fd = new FormData();
        fd.append('file', f);
        try {
            const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j.detail || '上传失败');
            ok++;
        } catch (e) {
            fail++;
            status.className = 'upload-status error';
            status.textContent = `${f.name}: ${e.message}`;
            await loadDocs();
            return;
        }
    }

    status.className = 'upload-status success';
    status.textContent = `已上传 ${ok} 个文件${fail ? `，失败 ${fail} 个` : ''}`;
    toast(`已上传 ${ok} 个文件`, 'success');
    await loadDocs();
}

async function loadDocs() {
    const list = $('#docs-list');
    const meta = $('#docs-meta');
    try {
        const r = await fetch(`${API}/documents`);
        const docs = await r.json();
        if (!docs.length) {
            list.innerHTML = '<div class="empty">还没有文档。先上传一份试试。</div>';
            meta.textContent = '0 篇';
            return;
        }
        const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);
        meta.textContent = `${docs.length} 篇 · ${totalChunks} 段`;
        list.innerHTML = docs.map(d => {
            const ext = (d.filename.split('.').pop() || 'doc').slice(0, 4);
            const size = `${d.chunk_count} 段 · ${new Date(d.created_at).toLocaleString()}`;
            return `
              <div class="doc-row">
                <span class="doc-icon">${escapeHtml(ext)}</span>
                <div class="doc-meta-main">
                    <div class="doc-name">${escapeHtml(d.filename)}</div>
                    <div class="doc-sub">${escapeHtml(size)}</div>
                </div>
                <button class="doc-del" data-name="${escapeHtml(d.filename)}">删除</button>
              </div>`;
        }).join('');
        $$('.doc-del').forEach(btn => btn.addEventListener('click', () => deleteDoc(btn.dataset.name)));
    } catch (e) {
        list.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
    }
}

async function deleteDoc(name) {
    if (!confirm(`删除「${name}」？`)) return;
    try {
        const r = await fetch(`${API}/documents/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error((await r.json()).detail || '删除失败');
        toast('已删除', 'success');
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
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.replace(/^\n/, '')}</code></pre>`);
    // Inline code
    s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    // Headings
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>')
         .replace(/^## (.+)$/gm, '<h2>$1</h2>')
         .replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold / italic
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    // Links [text](url)
    s = s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Blockquote
    s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Tables
    s = s.replace(/((?:^\|.*\|\s*\n)+)/gm, table => {
        const lines = table.trim().split('\n');
        if (lines.length < 2) return table;
        const cells = line => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(lines[0]);
        const body = lines.slice(2).map(cells);
        let html = '<table><thead><tr>' + head.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        for (const row of body) {
            html += '<tr>' + row.map((c, i) => `<td>${c || ''}</td>`).join('') + '</tr>';
        }
        return html + '</tbody></table>';
    });
    // Lists & paragraphs
    const lines = s.split('\n');
    const out = [];
    let inUl = false, inOl = false, para = [];

    const flushPara = () => {
        if (para.length) {
            out.push('<p>' + para.join(' ') + '</p>');
            para = [];
        }
    };
    const closeLists = () => {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
    };

    for (const ln of lines) {
        const t = ln.trim();
        if (!t) { flushPara(); closeLists(); continue; }
        if (/^<h[123]>/.test(t) || /^<pre>/.test(t) || /^<blockquote>/.test(t) || /^<table>/.test(t)) {
            flushPara(); closeLists(); out.push(t); continue;
        }
        const ul = t.match(/^[-*]\s+(.+)$/);
        const ol = t.match(/^\d+\.\s+(.+)$/);
        if (ul) {
            flushPara();
            if (inOl) { out.push('</ol>'); inOl = false; }
            if (!inUl) { out.push('<ul>'); inUl = true; }
            out.push('<li>' + ul[1] + '</li>');
        } else if (ol) {
            flushPara();
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (!inOl) { out.push('<ol>'); inOl = true; }
            out.push('<li>' + ol[1] + '</li>');
        } else {
            closeLists();
            para.push(t);
        }
    }
    flushPara(); closeLists();
    return out.join('\n');
}

/* ============================================================
   Chat (streaming via SSE)
   ============================================================ */
const chatHistory = []; // {role, content}

function bindChat() {
    const form  = $('#chat-form');
    const input = $('#chat-input');
    const empty = $('#chat-empty');
    const thread = $('#chat-thread');

    // Auto-grow textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    // Suggestion chips
    $$('.chip').forEach(c => c.addEventListener('click', () => {
        input.value = c.dataset.q;
        form.requestSubmit();
    }));

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;

        if (!isConfigured()) {
            toast('请先在右上角配置 API Key', 'error');
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
                    api_key: s.apiKey,
                    endpoint: s.endpoint,
                    model: s.model,
                }),
            });

            if (!resp.ok) {
                let detail = '';
                try { detail = (await resp.json()).detail; } catch {}
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
                bubble.innerHTML = '<span class="empty" style="padding:8px;">（空回复）</span>';
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
    wrap.innerHTML = `
      <div class="msg-role">${role === 'user' ? '你' : '知图'}</div>
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
      <summary>引用了 ${results.length} 段知识库</summary>
      ${results.map(r => `
        <div class="src-item">
          <div class="src-name">${escapeHtml(r.filename)} · 相似度 ${(r.similarity*100).toFixed(0)}%</div>
          <div class="src-text">${escapeHtml(r.content).slice(0, 240)}${r.content.length > 240 ? '…' : ''}</div>
        </div>`).join('')}
    `;
    msgEl.appendChild(details);
}

function parseSSE(chunk) {
    let event = 'message', dataStr = '';
    for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
    }
    if (!dataStr) return null;
    try { return { event, data: JSON.parse(dataStr) }; }
    catch { return null; }
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
            toast('请先在右上角配置 API Key', 'error');
            $('#open-settings').click();
            return null;
        }
        return {
            title: $('#gen-title').value.trim() || '知图 Document',
            prompt: $('#gen-prompt').value.trim(),
            top_k: s.topK,
            use_knowledge: $('#use-knowledge-gen').checked,
            temperature: s.temperature,
            max_tokens: s.maxTokens,
            api_key: s.apiKey,
            endpoint: s.endpoint,
            model: s.model,
        };
    }

    previewBtn.addEventListener('click', async () => {
        const body = await gatherPayload(true);
        if (!body) return;
        if (!body.prompt) { toast('请填写写作要求', 'error'); return; }
        const pv = $('#gen-preview');
        pv.innerHTML = '<div class="empty"><span class="spinner"></span> 大模型正在打草稿…</div>';
        status.textContent = '生成中…';
        try {
            const r = await fetch(`${API}/generate-doc-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.detail || '预览失败');
            pv.innerHTML = renderMarkdown(j.markdown);
            $('#gen-preview-meta').textContent = `${j.markdown.length} 字`;
            status.textContent = '草稿已生成';
            toast('预览已生成', 'success');
        } catch (e) {
            pv.innerHTML = `<div class="empty" style="color:var(--danger);">${escapeHtml(e.message)}</div>`;
            status.textContent = '失败';
        }
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const body = await gatherPayload(false);
        if (!body) return;
        if (!body.prompt) { toast('请填写写作要求', 'error'); return; }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        const original = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span> 生成中…';
        status.textContent = '生成并渲染 Word…';
        try {
            const r = await fetch(`${API}/generate-doc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!r.ok) {
                let detail = '';
                try { detail = (await r.json()).detail; } catch {}
                throw new Error(detail || `HTTP ${r.status}`);
            }
            const blob = await r.blob();
            // Pull filename from Content-Disposition
            const cd = r.headers.get('Content-Disposition') || '';
            const m = cd.match(/filename="?([^"]+)"?/);
            const filename = m ? m[1] : `${body.title}.docx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            a.remove();
            URL.revokeObjectURL(url);
            status.textContent = `已下载 ${filename}`;
            toast('文档已下载', 'success');

            // Also update preview from the same response if possible
            // (Server returns docx bytes; preview stays as-is unless we re-call preview)
        } catch (e) {
            status.textContent = '失败';
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
    bindTabs();
    bindSettingsModal();
    bindUpload();
    bindChat();
    bindGenerate();
    loadDocs();
    if (!isConfigured()) {
        setTimeout(() => {
            toast('提示：右上角齿轮里填一下 API Key', '');
        }, 600);
    }
});
