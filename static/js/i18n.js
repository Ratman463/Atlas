/* ============================================================
   知图 · i18n (中文 / English)
   ------------------------------------------------------------
   设计要点：
   - 单一来源 translations[lang][key]
   - DOM 元素加 data-i18n="key" 自动 textContent
   - data-i18n-placeholder / data-i18n-aria 同理
   - main.js 内部动态生成的文案通过 t('key') 取
   - 偏好存 localStorage('atlas.lang')，刷新保留
   - 切换会广播 'langchange' 事件，便于必要时局部刷新
   ============================================================ */

(function (global) {
    'use strict';

    const SUPPORTED = ['zh', 'en'];
    const DEFAULT_LANG = 'zh';
    const STORAGE_KEY = 'atlas.lang';

    const translations = {
        zh: {
            htmlLang: 'zh-CN',
            title: '知图 · 本地知识库 · AI 问答 · 文档生成',
            description:
                '知图（Atlas）：一个轻量本地知识库 + 在线 AI 问答 + Word 文档生成工具，自带 OpenAI 兼容 API Key。搜索知识库、问文档、一键出报告，全部本地跑。',

            /* ---------- 顶部导航 ---------- */
            'nav.brand': '知图',
            'nav.tab.knowledge': '知识库',
            'nav.tab.ask': '智能问答',
            'nav.tab.generate': '文档生成',
            'nav.settings.title': '配置 API Key',
            'nav.lang.aria': '切换语言',

            /* ---------- Tab1 知识库 ---------- */
            'kb.hero.title': '知识库',
            'kb.hero.sub':
                '把你手头的文档丢进来，PDF、Word、TXT、Markdown 都行<br>系统会自动切块、向量化，留着给你提问和生成文档用',
            'kb.dropzone.title': '拖拽文件到这里，或点击选择',
            'kb.dropzone.hint': '支持 PDF · DOCX · TXT · MD · XLSX · 单次最多 200\u00a0MB',
            'kb.list.title': '文档列表',
            'kb.list.meta.loading': '加载中…',
            'kb.list.empty': '还没有文档，先上传一份试试',
            'kb.list.empty.fail': '加载失败：{msg}',
            'kb.list.unit': '篇',
            'kb.list.unit.chunks': '段',
            'kb.doc.delete': '删除',
            'kb.doc.delete.confirm': '删除「{name}」？',
            'kb.doc.delete.fail': '删除失败',
            'kb.doc.deleted': '已删除',
            'kb.upload.processing': '正在处理 {name} …',
            'kb.upload.fail': '上传失败',
            'kb.upload.fail.item': '{name}: {msg}',
            'kb.upload.done': '已上传 {n} 个文件',
            'kb.upload.done.withfail': '已上传 {n} 个文件，失败 {m} 个',
            'kb.upload.count': '已获取 {n} 个模型',
            'kb.upload.fetch.fail': '获取失败：{msg}',

            /* ---------- Tab2 智能问答 ---------- */
            'ask.hero.title': '问知识库一句话',
            'ask.hero.sub':
                '基于你的文档检索 + 大模型综合回答，逐字流式输出<br>每条回复都会标注来源片段，方便核对',
            'ask.empty.icon': '✦',
            'ask.empty.tip': '提问吧，我会先去翻你的知识库',
            'ask.chip.1.q': '总结一下知识库里都讲了什么',
            'ask.chip.1.label': '总结一下知识库',
            'ask.chip.2.q': '列出所有提到的核心概念',
            'ask.chip.2.label': '列出核心概念',
            'ask.chip.3.q': '写三条可以追问的方向',
            'ask.chip.3.label': '给我追问的方向',
            'ask.use.kb': '引用知识库',
            'ask.clear': '清空对话',
            'ask.clear.confirm': '清空当前对话？',
            'ask.input.placeholder': '输入问题，Enter 发送，Shift+Enter 换行',
            'ask.send': '发送',
            'ask.role.user': '你',
            'ask.role.ai': '知图',
            'ask.sources.summary': '引用了 {n} 段知识库',
            'ask.source.similarity': '相似度 {pct}%',
            'ask.empty.reply': '（空回复）',
            'ask.need.config': '请先在右上角配置 API Key',
            'ask.error.fetch.models.first': '请先填好 Endpoint 和 API Key',
            'ask.error.need.model': '请先填或选一个 Model',
            'ask.error.save.all': '请把 Endpoint / API Key / Model 都填好',
            'ask.conn.ok': '连接成功：{msg}',
            'ask.conn.fail': '连接失败：{msg}',
            'ask.fetching': '拉取中…',
            'ask.testing': '测试中…',
            'ask.saved': '配置已保存',
            'ask.cleared': '已清空',
            'ask.clear.confirm2': '清空所有配置？',
            'ask.boot.hint': '提示：右上角齿轮里填一下 API Key',

            /* ---------- Tab3 文档生成 ---------- */
            'gen.hero.title': '一句话生成 Word',
            'gen.hero.sub':
                '告诉它你要写什么，它会先翻知识库找素材，再让大模型按 Markdown 排版<br>最后渲染成可以直接下载的 .docx 文档',
            'gen.field.title': '文档标题',
            'gen.field.title.placeholder': '比如：2026 Q3 产品复盘报告',
            'gen.field.prompt': '写作要求 / 主题',
            'gen.field.prompt.placeholder':
                '例如：基于知识库内容，写一份给非技术同事看的项目总结，包括背景、关键决策、风险点和下一步。语气专业但口语化，1500 字左右。',
            'gen.use.kb': '引用知识库',
            'gen.status.idle': '尚未生成',
            'gen.btn.preview': '预览 Markdown',
            'gen.btn.submit': '生成并下载 Word',
            'gen.preview.title': '预览',
            'gen.preview.meta.empty': '空',
            'gen.preview.empty':
                '点击 <b>预览 Markdown</b> 看到大模型输出的内容；<br>点击 <b>生成并下载 Word</b> 直接拿 .docx。',
            'gen.need.prompt': '请填写写作要求',
            'gen.drafting': '大模型正在打草稿…',
            'gen.status.gen': '生成中…',
            'gen.status.drafted': '草稿已生成',
            'gen.meta.chars': '{n} 字',
            'gen.preview.ok': '预览已生成',
            'gen.preview.fail': '预览失败',
            'gen.status.fail': '失败',
            'gen.status.word': '生成并渲染 Word…',
            'gen.status.downloaded': '已下载 {name}',
            'gen.toast.downloaded': '文档已下载',
            'gen.fallback.title': '知图 Document',

            /* ---------- 设置 Modal ---------- */
            'cfg.title': '连接配置',
            'cfg.close.aria': '关闭',
            'cfg.tip': '配置仅保存在浏览器 localStorage，不会上传到服务器。以下均遵循 OpenAI 兼容接口规范。',
            'cfg.endpoint': 'API Endpoint',
            'cfg.endpoint.placeholder': 'https://api.deepseek.com/v1/chat/completions',
            'cfg.endpoint.hint':
                '如 <code>https://api.deepseek.com/v1/chat/completions</code>，或填 <code>/v1</code> 末尾。',
            'cfg.apikey': 'API Key',
            'cfg.apikey.placeholder': 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            'cfg.apikey.hint': '各平台生成的一串密钥，形如 <code>sk-</code> 开头。',
            'cfg.model': 'Model',
            'cfg.model.placeholder': '填写或选择模型 ID，如 deepseek-chat',
            'cfg.model.btn.fetch': '获取模型列表',
            'cfg.model.btn.test': '测试连接',
            'cfg.model.hint': '可点击「获取模型列表」自动拉取，也可手动输入模型 ID。',
            'cfg.sysprompt': '自定义提示词（可选）',
            'cfg.sysprompt.placeholder':
                '留空则使用内置默认提示词。可覆盖问答与文档生成时的角色设定，例如：\n你是一名资深产品经理，所有回答控制在 200 字以内，先给结论再解释。',
            'cfg.sysprompt.hint': '留空 = 默认。填了会作为 system message 同时作用于智能问答与文档生成。',
            'cfg.temperature': 'Temperature',
            'cfg.temperature.hint': '采样温度（0–2），越低越稳定。',
            'cfg.maxtokens': 'Max tokens',
            'cfg.maxtokens.hint': '单次最多生成的 token 数。',
            'cfg.topk': '引用片段数 (Top K)',
            'cfg.topk.hint': 'RAG 检索时取最相关的 K 个片段拼入上下文。',
            'cfg.btn.reset': '清空',
            'cfg.btn.save': '保存',

            /* ---------- Footer ---------- */
            'footer.text': '知图 · Atlas · 本地知识库 + 在线大模型问答与文档生成',

            /* ---------- Lang switcher ---------- */
            'lang.zh': '中',
            'lang.en': 'EN',
        },

        en: {
            htmlLang: 'en',
            title: 'Atlas · Local KB · AI Q&A · Doc Generator',
            description:
                'Atlas: a lightweight local knowledge base with online AI Q&A and Word document generation. Bring your own OpenAI-compatible API key. Search your KB, ask your docs, generate reports in one click — all running locally.',

            /* ---------- Nav ---------- */
            'nav.brand': 'Atlas',
            'nav.tab.knowledge': 'Knowledge',
            'nav.tab.ask': 'Ask',
            'nav.tab.generate': 'Generate',
            'nav.settings.title': 'Configure API Key',
            'nav.lang.aria': 'Switch language',

            /* ---------- Tab1 Knowledge ---------- */
            'kb.hero.title': 'Knowledge Base',
            'kb.hero.sub':
                'Drop in your documents — PDF, Word, TXT, Markdown all work.<br>They get chunked and vectorized automatically, ready for Q&A and generation.',
            'kb.dropzone.title': 'Drag files here, or click to select',
            'kb.dropzone.hint': 'Supports PDF · DOCX · TXT · MD · XLSX · up to 200\u00a0MB at a time',
            'kb.list.title': 'Documents',
            'kb.list.meta.loading': 'Loading…',
            'kb.list.empty': 'No documents yet — try uploading one',
            'kb.list.empty.fail': 'Failed to load: {msg}',
            'kb.list.unit': 'docs',
            'kb.list.unit.chunks': 'chunks',
            'kb.doc.delete': 'Delete',
            'kb.doc.delete.confirm': 'Delete “{name}”?',
            'kb.doc.delete.fail': 'Delete failed',
            'kb.doc.deleted': 'Deleted',
            'kb.upload.processing': 'Processing {name} …',
            'kb.upload.fail': 'Upload failed',
            'kb.upload.fail.item': '{name}: {msg}',
            'kb.upload.done': 'Uploaded {n} file(s)',
            'kb.upload.done.withfail': 'Uploaded {n} file(s), {m} failed',
            'kb.upload.count': 'Fetched {n} models',
            'kb.upload.fetch.fail': 'Fetch failed: {msg}',

            /* ---------- Tab2 Ask ---------- */
            'ask.hero.title': 'Ask your knowledge base anything',
            'ask.hero.sub':
                'Retrieves from your docs, then streams a synthesized answer from the LLM.<br>Every reply cites its sources so you can verify.',
            'ask.empty.icon': '✦',
            'ask.empty.tip': 'Ask away — I’ll dig through your knowledge base first',
            'ask.chip.1.q': 'Summarize what’s in the knowledge base',
            'ask.chip.1.label': 'Summarize the KB',
            'ask.chip.2.q': 'List every core concept mentioned',
            'ask.chip.2.label': 'List core concepts',
            'ask.chip.3.q': 'Suggest three follow-up directions',
            'ask.chip.3.label': 'Suggest follow-ups',
            'ask.use.kb': 'Use knowledge base',
            'ask.clear': 'Clear chat',
            'ask.clear.confirm': 'Clear the current conversation?',
            'ask.input.placeholder': 'Type a question — Enter to send, Shift+Enter for newline',
            'ask.send': 'Send',
            'ask.role.user': 'You',
            'ask.role.ai': 'Atlas',
            'ask.sources.summary': 'Cited {n} chunks',
            'ask.source.similarity': 'similarity {pct}%',
            'ask.empty.reply': '(empty reply)',
            'ask.need.config': 'Please configure your API Key first (top-right gear)',
            'ask.error.fetch.models.first': 'Please fill in Endpoint and API Key first',
            'ask.error.need.model': 'Please enter or pick a Model',
            'ask.error.save.all': 'Please fill in Endpoint / API Key / Model',
            'ask.conn.ok': 'Connected: {msg}',
            'ask.conn.fail': 'Connection failed: {msg}',
            'ask.fetching': 'Fetching…',
            'ask.testing': 'Testing…',
            'ask.saved': 'Settings saved',
            'ask.cleared': 'Cleared',
            'ask.clear.confirm2': 'Clear all settings?',
            'ask.boot.hint': 'Tip: set your API Key in the top-right gear icon',

            /* ---------- Tab3 Generate ---------- */
            'gen.hero.title': 'Generate a Word doc in one sentence',
            'gen.hero.sub':
                'Tell it what to write. It pulls context from your KB, drafts Markdown with the LLM,<br>then renders a downloadable .docx.',
            'gen.field.title': 'Document title',
            'gen.field.title.placeholder': 'e.g. 2026 Q3 Product Retrospective',
            'gen.field.prompt': 'Requirements / topic',
            'gen.field.prompt.placeholder':
                'e.g. Based on the knowledge base, write a project summary for non-technical colleagues, covering background, key decisions, risks, and next steps. Professional but conversational tone, around 1500 words.',
            'gen.use.kb': 'Use knowledge base',
            'gen.status.idle': 'Nothing generated yet',
            'gen.btn.preview': 'Preview Markdown',
            'gen.btn.submit': 'Generate & download Word',
            'gen.preview.title': 'Preview',
            'gen.preview.meta.empty': 'empty',
            'gen.preview.empty':
                'Click <b>Preview Markdown</b> to see the model output;<br>click <b>Generate & download Word</b> to grab the .docx directly.',
            'gen.need.prompt': 'Please describe what you want',
            'gen.drafting': 'The model is drafting…',
            'gen.status.gen': 'Generating…',
            'gen.status.drafted': 'Draft ready',
            'gen.meta.chars': '{n} chars',
            'gen.preview.ok': 'Preview ready',
            'gen.preview.fail': 'Preview failed',
            'gen.status.fail': 'Failed',
            'gen.status.word': 'Generating & rendering Word…',
            'gen.status.downloaded': 'Downloaded {name}',
            'gen.toast.downloaded': 'Document downloaded',
            'gen.fallback.title': 'Atlas Document',

            /* ---------- Settings Modal ---------- */
            'cfg.title': 'Connection Settings',
            'cfg.close.aria': 'Close',
            'cfg.tip': 'Settings are stored only in your browser’s localStorage and never uploaded. All fields follow the OpenAI-compatible API spec.',
            'cfg.endpoint': 'API Endpoint',
            'cfg.endpoint.placeholder': 'https://api.openai.com/v1/chat/completions',
            'cfg.endpoint.hint':
                'E.g. <code>https://api.openai.com/v1/chat/completions</code>, or end with <code>/v1</code>.',
            'cfg.apikey': 'API Key',
            'cfg.apikey.placeholder': 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            'cfg.apikey.hint': 'A secret key from your provider, usually starting with <code>sk-</code>.',
            'cfg.model': 'Model',
            'cfg.model.placeholder': 'Type or pick a model ID, e.g. gpt-4o-mini',
            'cfg.model.btn.fetch': 'Fetch models',
            'cfg.model.btn.test': 'Test connection',
            'cfg.model.hint': 'Click “Fetch models” to auto-populate, or type a model ID manually.',
            'cfg.sysprompt': 'Custom system prompt (optional)',
            'cfg.sysprompt.placeholder':
                'Leave empty to use the built-in default. Override the role for both Q&A and generation, e.g.:\nYou are a senior PM. Keep every answer under 200 words, conclusion first, then explanation.',
            'cfg.sysprompt.hint': 'Empty = default. Applied as the system message for both Q&A and doc generation.',
            'cfg.temperature': 'Temperature',
            'cfg.temperature.hint': 'Sampling temperature (0–2). Lower = more deterministic.',
            'cfg.maxtokens': 'Max tokens',
            'cfg.maxtokens.hint': 'Maximum tokens to generate per call.',
            'cfg.topk': 'Cited chunks (Top K)',
            'cfg.topk.hint': 'Number of most relevant chunks to retrieve and feed as context.',
            'cfg.btn.reset': 'Clear',
            'cfg.btn.save': 'Save',

            /* ---------- Footer ---------- */
            'footer.text': 'Atlas · Local KB + online LLM Q&A and document generation',

            /* ---------- Lang switcher ---------- */
            'lang.zh': '中',
            'lang.en': 'EN',
        },
    };

    /* ---------- helpers ---------- */
    function getStoredLang() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v && SUPPORTED.indexOf(v) !== -1) return v;
        } catch (e) {}
        return DEFAULT_LANG;
    }

    function applyTemplate(str, vars) {
        if (!str || !vars) return str;
        return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
    }

    /** Translate a key with optional {var} interpolation. */
    function t(key, vars) {
        const lang = getStoredLang();
        const dict = translations[lang] || translations[DEFAULT_LANG];
        const val = dict[key];
        if (val == null) {
            // fallback to default lang, then to key itself
            const fb = translations[DEFAULT_LANG][key];
            return fb != null ? applyTemplate(fb, vars) : key;
        }
        return applyTemplate(val, vars);
    }

    /** Apply a language to all [data-i18n*] nodes + html lang + title + meta. */
    function applyLang(lang) {
        if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
        const dict = translations[lang];

        // <html lang> + title + meta description
        const html = document.documentElement;
        html.setAttribute('lang', dict.htmlLang);
        html.dataset.lang = lang;

        const titleEl = document.querySelector('title');
        if (titleEl) titleEl.textContent = dict.title;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', dict.description);

        // textContent
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const k = el.getAttribute('data-i18n');
            const v = dict[k];
            if (typeof v === 'string') {
                // allow a tiny subset of HTML in our own dictionaries (<br>, <b>, <code>)
                if (/<[a-z][^>]*>/i.test(v)) el.innerHTML = v;
                else el.textContent = v;
            }
        });

        // placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const k = el.getAttribute('data-i18n-placeholder');
            const v = dict[k];
            if (typeof v === 'string') el.setAttribute('placeholder', v);
        });

        // title (tooltip) attribute
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const k = el.getAttribute('data-i18n-title');
            const v = dict[k];
            if (typeof v === 'string') el.setAttribute('title', v);
        });

        // aria-label
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
            const k = el.getAttribute('data-i18n-aria');
            const v = dict[k];
            if (typeof v === 'string') el.setAttribute('aria-label', v);
        });

        // data-q (chip questions are dynamic)
        document.querySelectorAll('[data-i18n-data-q]').forEach((el) => {
            const k = el.getAttribute('data-i18n-data-q');
            const v = dict[k];
            if (typeof v === 'string') el.setAttribute('data-q', v);
        });

        // lang switch buttons active state
        document.querySelectorAll('.lang-btn').forEach((btn) => {
            const active = btn.dataset.lang === lang;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        // persist + broadcast
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) {}
        global.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    }

    /** Wire up the language switch buttons. */
    function initSwitcher() {
        const initial = (document.documentElement.dataset.lang) || getStoredLang();
        applyLang(initial);

        document.querySelectorAll('.lang-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                if (SUPPORTED.indexOf(lang) === -1) return;
                applyLang(lang);
            });
        });
    }

    /* ---------- export ---------- */
    global.AtlasI18n = {
        SUPPORTED,
        DEFAULT_LANG,
        STORAGE_KEY,
        translations,
        t,
        getStoredLang,
        applyLang,
        initSwitcher,
    };
})(window);
