/* ============================================================
   ADMIN PANEL

   Edits content.js in the browser and commits it straight back to
   GitHub, which triggers a Pages rebuild. Nothing here runs on the
   public site - index.html never loads this file.

   The form is generated from SCHEMA below, so adding a new editable
   field means adding one entry there rather than writing markup.
   ============================================================ */

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);

    const STORE_REPO = 'portfolioAdmin.repo';
    const STORE_TOKEN = 'portfolioAdmin.token';
    const DRAFT_KEY = 'portfolioDraft';

    const state = {
        content: null,      // working copy, mutated as you type
        original: null,     // snapshot used for the dirty check
        activeSection: null,
        offline: false,
        openItems: new Set()
    };

    const repo = { owner: '', name: '', branch: 'main', token: '' };


    /* ============================================================
       UTILITIES
       ============================================================ */

    const clone = (v) => JSON.parse(JSON.stringify(v));

    function getIn(obj, path) {
        return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
    }

    function setIn(obj, path, value) {
        const last = path[path.length - 1];
        const parent = path.slice(0, -1).reduce((acc, key) => {
            if (acc[key] == null) acc[key] = typeof key === 'number' ? [] : {};
            return acc[key];
        }, obj);
        parent[last] = value;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;');
    }

    function escapeRegex(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function toBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    function fromBase64(b64) {
        const binary = atob(String(b64).replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Could not read that file.'));
            reader.readAsDataURL(file);
        });
    }


    /* ============================================================
       CONTENT FILE SERIALISATION

       content.js is a JS file rather than JSON so the public site can
       load it with a plain <script> tag and therefore still work when
       index.html is opened straight off the filesystem.
       ============================================================ */

    const CONTENT_HEADER = [
        '/* ============================================================',
        '   SITE CONTENT - single source of truth for every word on the site.',
        '',
        '   You should not need to edit this by hand. Open admin.html, make',
        '   your changes there, and hit Publish.',
        '',
        '   Sections whose item list is empty are hidden on the live site,',
        '   and their nav links disappear with them. That is how the case',
        '   studies, teardowns, experiments, observations, frameworks and',
        '   learning sections stay out of the way until you have written',
        '   something.',
        '   ============================================================ */',
        '',
        'window.SITE_CONTENT = '
    ].join('\n');

    function serialiseContent(data) {
        const copy = clone(data);
        copy.meta = copy.meta || {};
        copy.meta.schemaVersion = 2;
        copy.meta.updatedAt = new Date().toISOString().slice(0, 10);
        return `${CONTENT_HEADER}${JSON.stringify(copy, null, 2)};\n`;
    }

    function parseContentFile(text) {
        const anchor = text.indexOf('window.SITE_CONTENT');
        const start = text.indexOf('{', anchor === -1 ? 0 : anchor);
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1 || end < start) {
            throw new Error('That file does not look like a content.js.');
        }
        return JSON.parse(text.slice(start, end + 1));
    }


    /* ============================================================
       GITHUB CLIENT
       ============================================================ */

    const api = {
        url(path) {
            return `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${path}`;
        },

        headers() {
            return {
                Authorization: `Bearer ${repo.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            };
        },

        async describeError(response) {
            let detail = '';
            try {
                const body = await response.json();
                detail = body.message || '';
            } catch (err) {
                /* response had no JSON body */
            }

            if (response.status === 401) return 'GitHub rejected the token (401). It may be expired or mistyped.';
            if (response.status === 403) {
                return 'GitHub refused the request (403). Check the token has Contents → Read and write on this repository.';
            }
            if (response.status === 404) {
                return 'Not found (404). Check the username, repository name and branch.';
            }
            if (response.status === 409) {
                return 'Branch conflict (409). The branch name may be wrong, or the repository is empty.';
            }
            if (response.status === 422) {
                return `GitHub rejected the change (422). ${detail}`;
            }
            return `GitHub returned ${response.status}. ${detail}`;
        },

        async repoInfo() {
            const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, {
                headers: this.headers()
            });
            if (!response.ok) throw new Error(await this.describeError(response));
            return response.json();
        },

        /** Returns { text, sha } or null when the file does not exist yet. */
        async read(path) {
            const response = await fetch(
                `${this.url(path)}?ref=${encodeURIComponent(repo.branch)}&t=${Date.now()}`,
                { headers: this.headers(), cache: 'no-store' }
            );
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(await this.describeError(response));

            const body = await response.json();
            return {
                sha: body.sha,
                text: body.content ? fromBase64(body.content) : ''
            };
        },

        /** Returns the blob sha without downloading the content. */
        async sha(path) {
            const response = await fetch(
                `${this.url(path)}?ref=${encodeURIComponent(repo.branch)}&t=${Date.now()}`,
                { headers: this.headers(), cache: 'no-store' }
            );
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(await this.describeError(response));
            const body = await response.json();
            return body.sha || null;
        },

        async write(path, base64, message, sha) {
            const payload = { message, content: base64, branch: repo.branch };
            if (sha) payload.sha = sha;

            const response = await fetch(this.url(path), {
                method: 'PUT',
                headers: { ...this.headers(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(await this.describeError(response));
            return response.json();
        }
    };


    /* ============================================================
       SCHEMA
       Drives both the sidebar and every form control.
       ============================================================ */

    const STATUS_OPTIONS = [
        { value: 'open', label: 'Open to work' },
        { value: 'selective', label: 'Open to the right role' },
        { value: 'closed', label: 'Not looking' }
    ];

    // Picking a status swaps in the matching headline, but only while the
    // headline is still one of these - a hand-written one is left alone.
    const DEFAULT_HEADLINES = {
        open: 'Open to work',
        selective: 'Open to the right opportunity',
        closed: 'Not looking right now'
    };

    function applyStatusHeadline(status) {
        const availability = state.content.availability || {};
        const current = (availability.headline || '').trim();
        const isDefault =
            current === '' || Object.values(DEFAULT_HEADLINES).indexOf(current) !== -1;
        if (isDefault) availability.headline = DEFAULT_HEADLINES[status] || current;
    }

    const SCHEMA = [
        {
            key: 'availability',
            label: 'Availability',
            title: 'Availability',
            desc: 'The pill at the top of the hero. This is the thing worth keeping current — it is the first thing a recruiter reads.',
            root: ['availability'],
            fields: [
                {
                    path: 'status', type: 'select', label: 'Status', options: STATUS_OPTIONS,
                    hint: 'Sets the colour of the dot — green, amber or grey — and swaps in a matching headline. The bar above changes this too.',
                    afterChange: (value) => applyStatusHeadline(value)
                },
                { path: 'headline', type: 'text', label: 'Headline', placeholder: 'Open to work' },
                { path: 'detail', type: 'text', label: 'Supporting detail', placeholder: 'Optional — leave blank for just the headline' }
            ]
        },
        {
            key: 'profile',
            label: 'Profile & hero',
            title: 'Profile & hero',
            desc: 'The first screen. It has three seconds to say who you are, what you are moving toward, and why anyone should read on.',
            root: ['profile'],
            fields: [
                { path: 'name', type: 'text', label: 'Full name' },
                { path: 'title', type: 'text', label: 'Role you are targeting', hint: 'Used in the page title and the line under the hero.' },
                { path: 'greeting', type: 'text', label: 'Hero heading', placeholder: 'Atandrit Chatterjee' },
                { path: 'transition', type: 'text', label: 'Transition line', placeholder: 'Associate Software Engineer → Aspiring Product Manager', hint: 'The single most important line on the site. Says where you are and where you are going, without overclaiming either.' },
                { path: 'summary', type: 'textarea', label: 'Hero paragraph', rows: 4, hint: 'Two or three sentences. This is your pitch — lead with evidence, not adjectives.' },
                { path: 'location', type: 'text', label: 'Location' },
                { path: 'email', type: 'text', label: 'Email' },
                { path: 'phone', type: 'text', label: 'Phone', hint: 'Not displayed on the site — kept here for your own reference.' },
                { path: 'photo', type: 'text', label: 'Photo path', hint: 'A file inside assets/. Replace assets/pfp.jpg in GitHub to change the picture.' }
            ]
        },
        {
            key: 'metrics',
            label: 'Key numbers',
            title: 'Key numbers',
            desc: 'The band under the hero. Four is the sweet spot — these are what someone remembers after ten seconds.',
            root: ['metrics'],
            fields: [
                {
                    path: '', type: 'objectList', itemLabel: 'Number',
                    titleFrom: (item) => item.value || 'New number',
                    subtitleFrom: (item) => item.label,
                    itemFields: [
                        { path: 'value', type: 'text', label: 'The number', placeholder: '9' },
                        { path: 'label', type: 'text', label: 'What it counts', placeholder: 'International accounts' },
                        { path: 'detail', type: 'textarea', label: 'Detail', rows: 2 }
                    ]
                }
            ]
        },
        {
            key: 'about',
            label: 'About',
            title: 'About',
            root: ['about'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'paragraphs', type: 'stringList', label: 'Paragraphs', itemLabel: 'paragraph', multiline: true }
            ]
        },
        {
            key: 'whyPm',
            label: 'How I got here',
            title: 'How I got here',
            desc: 'Tell the story and let the reader reach the conclusion themselves. Stating the ambition outright ("this is why I want to be a PM") reads like a cover letter; a specific thing that happened at work is what nobody else can copy.',
            root: ['whyPm'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                {
                    path: 'paragraphs', type: 'stringList', label: 'Paragraphs', itemLabel: 'paragraph', multiline: true,
                    hint: 'Three works well: what you noticed, a concrete example of you acting on it, and what you want to do next.'
                }
            ]
        },
        {
            key: 'apmPitch',
            label: 'Why hire me',
            title: 'Why hire me for an APM role',
            desc: 'Your closing argument. Every line should be checkable, so nothing here can be read as a claim you cannot back up.',
            root: ['apmPitch'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                { path: 'bringHeading', type: 'text', label: 'Column heading', placeholder: 'What I bring' },
                { path: 'bring', type: 'stringList', label: 'What you bring', itemLabel: 'strength', multiline: true, hint: 'Each one should be checkable — something on this site, or something you can be asked about.' },
                { path: 'lackHeading', type: 'text', label: 'Second column heading (optional)', placeholder: "What I don't have" },
                { path: 'lack', type: 'stringList', label: "What you don't have (optional)", itemLabel: 'gap', multiline: true, hint: 'Empty, so only one column shows. Adding anything here brings back a second column naming the gaps — some hiring managers rate that honesty highly, so it is worth trying both.' }
            ]
        },
        {
            key: 'principles',
            label: 'Principles',
            title: 'How I think about product',
            desc: 'Short, opinionated statements backed by something you actually did. Vague principles read worse than none.',
            root: ['principles'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2, hint: 'Worth using this to be upfront about where these come from.' },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Principle',
                    titleFrom: (item) => item.title || 'New principle',
                    itemFields: [
                        { path: 'title', type: 'text', label: 'Principle' },
                        { path: 'body', type: 'textarea', label: 'Explanation', rows: 3 }
                    ]
                }
            ]
        },
        {
            key: 'experience',
            label: 'Experience',
            title: 'Experience',
            root: ['experience'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Role',
                    titleFrom: (item) => item.role || 'New role',
                    subtitleFrom: (item) => item.company,
                    itemFields: [
                        { path: 'role', type: 'text', label: 'Job title' },
                        { path: 'company', type: 'text', label: 'Company' },
                        { path: 'location', type: 'text', label: 'Location' },
                        { path: 'start', type: 'text', label: 'Start', placeholder: 'Nov 2024' },
                        { path: 'end', type: 'text', label: 'End', placeholder: 'Jul 2026', hint: 'Leave blank to show "Present".' },
                        { path: 'summary', type: 'textarea', label: 'One-line summary', rows: 2 },
                        { path: 'scope', type: 'textarea', label: 'Scope / accounts', rows: 2, hint: 'Shown in a grey box. Good place for client names.' },
                        { path: 'bullets', type: 'stringList', label: 'Achievements', itemLabel: 'bullet', multiline: true, hint: 'Start with the outcome, then how. Put a number in every bullet you can.' },
                        { path: 'tags', type: 'stringList', label: 'Skill tags', itemLabel: 'tag' }
                    ]
                }
            ]
        },
        {
            key: 'caseStudies',
            label: 'Case studies',
            title: 'Product case studies',
            desc: 'Hidden until you add one. This is the section that decides whether a founder replies. Pick a product you use, find something genuinely broken, and show the reasoning end to end. Five is a strong portfolio; one done properly beats five done thinly.',
            root: ['caseStudies'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Case study',
                    titleFrom: (item) => item.title || 'New case study',
                    subtitleFrom: (item) => item.subtitle,
                    itemFields: [
                        { path: 'title', type: 'text', label: 'Title', placeholder: 'Reducing Uber ride cancellations' },
                        { path: 'subtitle', type: 'text', label: 'Product', placeholder: 'Uber · Rider experience' },
                        { path: 'status', type: 'text', label: 'Badge', placeholder: 'Case study' },
                        { path: 'problem', type: 'textarea', label: 'The problem', rows: 4, hint: 'What is actually broken. Resist jumping to the solution here.' },
                        { path: 'user', type: 'textarea', label: 'Who it affects', rows: 2, hint: 'Name a segment, not "users".' },
                        { path: 'evidence', type: 'stringList', label: 'Evidence', itemLabel: 'source', multiline: true, hint: 'App store reviews, Reddit threads, support forums, your own screenshots. Quote and link where you can — this is what separates analysis from opinion.' },
                        { path: 'rootCause', type: 'textarea', label: 'Root cause', rows: 3, hint: 'Say which method got you here (5 Whys, JTBD, fishbone) and what it surfaced.' },
                        { path: 'solution', type: 'textarea', label: 'What you would build', rows: 4, hint: 'And why this instead of the obvious alternative.' },
                        { path: 'prioritisation', type: 'textarea', label: 'How you would prioritise', rows: 3, hint: 'RICE, impact vs effort, MoSCoW — show the working, not just the verdict.' },
                        { path: 'metrics', type: 'stringList', label: 'Success metrics', itemLabel: 'metric', multiline: true, hint: 'One primary metric and a guardrail is more convincing than six.' },
                        { path: 'risks', type: 'stringList', label: 'Risks', itemLabel: 'risk', multiline: true, hint: 'Listing what could go wrong is the single clearest signal of seniority here.' },
                        { path: 'tags', type: 'stringList', label: 'Tags', itemLabel: 'tag' },
                        { path: 'url', type: 'text', label: 'Full write-up URL', hint: 'Notion, Google Doc, Medium — anywhere public.' }
                    ]
                }
            ]
        },
        {
            key: 'projects',
            label: 'Products built',
            title: "Products I've built end to end",
            desc: 'Things you actually shipped. Lead with the problem and the decisions, not the tech stack. The optional fields lower down let you grow these into full case studies over time.',
            root: ['projects'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Product',
                    titleFrom: (item) => item.title || 'New product',
                    subtitleFrom: (item) => item.subtitle,
                    itemFields: [
                        { path: 'title', type: 'text', label: 'Project name' },
                        { path: 'subtitle', type: 'text', label: 'What it is', placeholder: 'Reading analytics dashboard' },
                        { path: 'role', type: 'text', label: 'Your role', placeholder: 'Solo — problem definition, design, build, ship' },
                        { path: 'status', type: 'text', label: 'Status badge', placeholder: 'Live' },
                        { path: 'problem', type: 'textarea', label: 'The problem', rows: 4 },
                        { path: 'user', type: 'textarea', label: 'Who it is for', rows: 2, hint: 'Optional, and left blank rather than guessed. Fill it in when you can describe a real person.' },
                        { path: 'evidence', type: 'stringList', label: 'Evidence the problem is real', itemLabel: 'source', multiline: true, hint: 'Optional. Reviews, forum posts, or anything you heard first-hand.' },
                        { path: 'decisions', type: 'stringList', label: 'Decisions you made', itemLabel: 'decision', multiline: true, hint: 'The part hiring managers care about. Each one should name a trade-off and why you chose your side of it.' },
                        { path: 'outcome', type: 'textarea', label: 'What shipped', rows: 3 },
                        { path: 'metrics', type: 'stringList', label: 'How you measure it', itemLabel: 'metric', multiline: true, hint: 'Optional. Real numbers if you have them, and nothing if you do not.' },
                        { path: 'risks', type: 'stringList', label: 'Risks and open questions', itemLabel: 'risk', multiline: true, hint: 'Optional. What you would want to validate next.' },
                        { path: 'tags', type: 'stringList', label: 'Stack / tags', itemLabel: 'tag' },
                        { path: 'live', type: 'text', label: 'Live URL' },
                        { path: 'github', type: 'text', label: 'Repository URL' }
                    ]
                }
            ]
        },
        {
            key: 'teardowns',
            label: 'Teardowns',
            title: 'Product teardowns',
            desc: 'Hidden until you add one. Pick products you use every day — WhatsApp, Notion, Spotify, Zomato, LinkedIn. The "what I would remove" answer tells a founder more about you than the whole rest of the page.',
            root: ['teardowns'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Teardown',
                    titleFrom: (item) => item.title || 'New teardown',
                    subtitleFrom: (item) => item.subtitle,
                    itemFields: [
                        { path: 'title', type: 'text', label: 'Product', placeholder: 'WhatsApp' },
                        { path: 'subtitle', type: 'text', label: 'Angle', placeholder: 'Why it won India' },
                        { path: 'status', type: 'text', label: 'Badge', placeholder: 'Teardown' },
                        { path: 'valueProp', type: 'textarea', label: 'Core value proposition', rows: 3, hint: 'One sentence. If it takes three, you have not found it yet.' },
                        { path: 'journey', type: 'textarea', label: 'User journey', rows: 4 },
                        { path: 'growthLoops', type: 'stringList', label: 'Growth loops', itemLabel: 'loop', multiline: true },
                        { path: 'strengths', type: 'stringList', label: 'What works', itemLabel: 'strength', multiline: true },
                        { path: 'weaknesses', type: 'stringList', label: 'What does not', itemLabel: 'weakness', multiline: true },
                        { path: 'wouldRemove', type: 'stringList', label: 'What you would remove', itemLabel: 'item', multiline: true, hint: 'Cutting is harder than adding, so this is the answer people read closest.' },
                        { path: 'wouldAdd', type: 'stringList', label: 'What you would add', itemLabel: 'item', multiline: true },
                        { path: 'tags', type: 'stringList', label: 'Tags', itemLabel: 'tag' },
                        { path: 'url', type: 'text', label: 'Full write-up URL' }
                    ]
                }
            ]
        },
        {
            key: 'experiments',
            label: 'Experiments',
            title: 'Experiments',
            desc: 'Hidden until you add one. Small things you built to test an assumption. Include the failures — "demand existed, retention was weak" is a better answer than a success with no numbers.',
            root: ['experiments'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Experiment',
                    titleFrom: (item) => item.title || 'New experiment',
                    subtitleFrom: (item) => item.subtitle,
                    itemFields: [
                        { path: 'title', type: 'text', label: 'What you tried', placeholder: 'AI resume feedback tool' },
                        { path: 'subtitle', type: 'text', label: 'One-liner' },
                        { path: 'status', type: 'text', label: 'Badge', placeholder: 'Shipped / Killed / Running' },
                        { path: 'hypothesis', type: 'textarea', label: 'Hypothesis', rows: 3, hint: 'Written as something that could turn out false.' },
                        { path: 'built', type: 'stringList', label: 'What you built', itemLabel: 'thing', multiline: true },
                        { path: 'results', type: 'stringList', label: 'Results', itemLabel: 'result', multiline: true, hint: 'Real numbers, however small. "120 visitors, 20 signups, 8 active" is worth more than "good traction".' },
                        { path: 'learnings', type: 'stringList', label: 'What you learned', itemLabel: 'learning', multiline: true },
                        { path: 'tags', type: 'stringList', label: 'Tags', itemLabel: 'tag' },
                        { path: 'url', type: 'text', label: 'Link' }
                    ]
                }
            ]
        },
        {
            key: 'frameworks',
            label: 'Frameworks',
            title: 'Frameworks I reach for',
            desc: 'Hidden until you add one. Only list what you have actually used — this is the fastest section on the site to get caught out on in an interview.',
            root: ['frameworks'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Framework',
                    titleFrom: (item) => item.framework || 'New framework',
                    subtitleFrom: (item) => item.topic,
                    itemFields: [
                        { path: 'topic', type: 'text', label: 'What for', placeholder: 'Prioritisation' },
                        { path: 'framework', type: 'text', label: 'Framework', placeholder: 'RICE' },
                        { path: 'note', type: 'textarea', label: 'How you use it', rows: 2, hint: 'One line on where it helped you, so it reads as experience rather than a reading list.' }
                    ]
                }
            ]
        },
        {
            key: 'observations',
            label: 'Observations',
            title: 'Product observations',
            desc: 'Hidden until you add one. One short note about something you noticed in a product you use. Add one a week and in a year this is the most convincing section on the site — nobody fakes a hundred of these.',
            root: ['observations'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Observation',
                    titleFrom: (item) => item.product || 'New observation',
                    subtitleFrom: (item) => item.date,
                    itemFields: [
                        { path: 'product', type: 'text', label: 'Product', placeholder: 'Spotify' },
                        { path: 'date', type: 'text', label: 'Date', placeholder: 'Aug 2026' },
                        { path: 'text', type: 'textarea', label: 'What you noticed', rows: 4, hint: 'Two or three sentences. Say what the design does and what you think it is for — the second half is the interesting bit.' }
                    ]
                }
            ]
        },
        {
            key: 'learning',
            label: "What I'm learning",
            title: "What I'm learning",
            desc: 'Hidden until you add one. Keep it current — a stale list here reads worse than no list. Add courses under Courses & certifications when you finish them.',
            root: ['learning'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Focus',
                    titleFrom: (item) => item.label || 'New focus',
                    itemFields: [
                        { path: 'label', type: 'text', label: 'What', placeholder: 'Product analytics' },
                        { path: 'detail', type: 'textarea', label: 'Detail', rows: 2, hint: 'What specifically, and how you are learning it.' }
                    ]
                }
            ]
        },
        {
            key: 'skills',
            label: 'Skills',
            title: 'Skills',
            desc: 'Grouped so a human can scan them and an applicant-tracking system can match them.',
            root: ['skills'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                {
                    path: 'groups', type: 'objectList', itemLabel: 'Group',
                    titleFrom: (item) => item.group || 'New group',
                    subtitleFrom: (item) => `${(item.items || []).length} skills`,
                    itemFields: [
                        { path: 'group', type: 'text', label: 'Group name' },
                        { path: 'items', type: 'stringList', label: 'Skills', itemLabel: 'skill' }
                    ]
                }
            ]
        },
        {
            key: 'writing',
            label: 'Product writing',
            title: 'Product writing',
            desc: 'Hidden on the site until you add at least one entry. Two teardowns or a public PRD here would do more for an APM application than anything else on this page.',
            root: ['writing'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'intro', type: 'textarea', label: 'Section intro', rows: 2 },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Piece',
                    titleFrom: (item) => item.title || 'New piece',
                    subtitleFrom: (item) => item.type,
                    itemFields: [
                        { path: 'title', type: 'text', label: 'Title' },
                        { path: 'type', type: 'text', label: 'Kind', placeholder: 'Teardown / PRD / Case study' },
                        { path: 'date', type: 'text', label: 'Date', placeholder: 'Aug 2026' },
                        { path: 'description', type: 'textarea', label: 'One-line description', rows: 2 },
                        { path: 'url', type: 'text', label: 'Link', hint: 'Medium, Substack, Notion, a Google Doc — anywhere public.' }
                    ]
                }
            ]
        },
        {
            key: 'education',
            label: 'Education',
            title: 'Education & certifications',
            root: ['education'],
            fields: [
                { path: 'heading', type: 'text', label: 'Education heading' },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Qualification',
                    titleFrom: (item) => item.degree || 'New qualification',
                    subtitleFrom: (item) => item.school,
                    itemFields: [
                        { path: 'degree', type: 'text', label: 'Degree' },
                        { path: 'school', type: 'text', label: 'Institution' },
                        { path: 'location', type: 'text', label: 'Location' },
                        { path: 'start', type: 'text', label: 'Start' },
                        { path: 'end', type: 'text', label: 'End' },
                        { path: 'detail', type: 'textarea', label: 'Detail', rows: 2 }
                    ]
                }
            ]
        },
        {
            key: 'certifications',
            label: 'Courses & certs',
            title: 'Courses & certifications',
            desc: 'Hidden until you add one. Add PM courses here as you finish them — for a career switch this is the cheapest credibility available.',
            root: ['certifications'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                {
                    path: 'items', type: 'objectList', itemLabel: 'Course or certification',
                    titleFrom: (item) => item.name || 'New entry',
                    subtitleFrom: (item) => item.issuer,
                    itemFields: [
                        { path: 'name', type: 'text', label: 'Name', placeholder: 'Product Management Fundamentals' },
                        { path: 'issuer', type: 'text', label: 'Issued by', placeholder: 'Product Alliance' },
                        { path: 'date', type: 'text', label: 'Date' },
                        { path: 'url', type: 'text', label: 'Credential URL' }
                    ]
                }
            ]
        },
        {
            key: 'contact',
            label: 'Contact',
            title: 'Contact section',
            root: ['contact'],
            fields: [
                { path: 'heading', type: 'text', label: 'Section heading' },
                { path: 'blurb', type: 'textarea', label: 'Intro text', rows: 3 },
                { path: 'directHeading', type: 'text', label: 'Heading above your links' },
                { path: 'successMessage', type: 'text', label: 'Message shown after someone writes to you' }
            ]
        },
        {
            key: 'socials',
            label: 'Links',
            title: 'Your links',
            desc: 'Shown in the contact section and the footer.',
            root: ['socials'],
            fields: [
                {
                    path: '', type: 'objectList', itemLabel: 'Link',
                    titleFrom: (item) => item.label || 'New link',
                    subtitleFrom: (item) => item.handle,
                    itemFields: [
                        { path: 'label', type: 'text', label: 'Label', placeholder: 'LinkedIn' },
                        { path: 'handle', type: 'text', label: 'Displayed text', placeholder: 'linkedin.com/in/…' },
                        { path: 'url', type: 'text', label: 'URL' }
                    ]
                }
            ]
        },
        {
            key: 'seo',
            label: 'Search & sharing',
            title: 'Search & link previews',
            desc: 'Controls the browser tab title and the card people see when your link is pasted into LinkedIn, Slack or WhatsApp. Publishing rewrites the tags inside index.html for you.',
            root: ['seo'],
            fields: [
                { path: 'title', type: 'text', label: 'Page title', hint: 'Shown in the browser tab and as the headline of the share card.' },
                { path: 'description', type: 'textarea', label: 'Description', rows: 4, hint: 'Aim for 140–160 characters.' },
                { path: 'keywords', type: 'textarea', label: 'Keywords', rows: 3 },
                { path: 'ogImage', type: 'text', label: 'Share image', hint: 'Path to a 1200×630 image inside assets/.' }
            ]
        },
        {
            key: 'config',
            label: 'Settings',
            title: 'Settings',
            desc: 'Resume file, contact-form delivery, and the site address.',
            root: ['config'],
            custom: 'settings',
            fields: [
                { path: 'siteUrl', type: 'text', label: 'Live site URL', hint: 'Used to build absolute links for the share card.' },
                { path: 'resumePath', type: 'text', label: 'Resume path in the repo' },
                { path: 'resumeDownloadName', type: 'text', label: 'Filename visitors receive' },
                { path: 'resumeUpdated', type: 'text', label: 'Resume "last updated" label', placeholder: 'Aug 2026' }
            ]
        },
        {
            key: 'footer',
            label: 'Footer',
            title: 'Footer',
            root: ['footer'],
            fields: [{ path: 'note', type: 'text', label: 'Footer line' }]
        }
    ];


    /* ============================================================
       FORM RENDERING
       ============================================================ */

    function markDirty() {
        const dirty = JSON.stringify(state.content) !== JSON.stringify(state.original);
        const info = $('.publish-info');
        info.classList.toggle('dirty', dirty);
        $('#dirtyText').textContent = dirty ? 'Unsaved changes' : 'No unsaved changes';
        $('#publishBtn').disabled = !dirty || state.offline;
        $('#revertBtn').disabled = !dirty;
        return dirty;
    }

    function onEdit() {
        markDirty();
        renderSidebar();
    }

    function labelFor(field) {
        return field.label || field.path;
    }

    /** Builds the control(s) for one schema field at an absolute content path. */
    function mountField(field, absPath) {
        const wrap = el('div', 'field');
        wrap.dataset.fieldPath = absPath.join('.');

        if (field.type === 'toggle') {
            const label = el('label', 'switch');
            const input = el('input');
            input.type = 'checkbox';
            input.checked = Boolean(getIn(state.content, absPath));
            input.addEventListener('change', () => {
                setIn(state.content, absPath, input.checked);
                syncQuickBar();
                onEdit();
            });
            label.append(input, el('span', 'switch-track'), el('span', 'switch-label', labelFor(field)));
            wrap.append(label);
            if (field.hint) wrap.append(el('p', 'hint', field.hint));
            return wrap;
        }

        if (field.type === 'stringList') {
            wrap.append(el('span', 'field-label', labelFor(field)));
            if (field.hint) wrap.append(el('p', 'hint', field.hint));
            wrap.append(buildStringList(field, absPath));
            return wrap;
        }

        if (field.type === 'objectList') {
            if (field.label) wrap.append(el('span', 'field-label', field.label));
            if (field.hint) wrap.append(el('p', 'hint', field.hint));
            wrap.append(buildObjectList(field, absPath));
            return wrap;
        }

        const id = `f_${absPath.join('_')}`.replace(/[^\w]/g, '_');
        const label = el('label', null, labelFor(field));
        label.setAttribute('for', id);
        wrap.append(label);

        let input;
        if (field.type === 'textarea') {
            input = el('textarea');
            input.rows = field.rows || 3;
        } else if (field.type === 'select') {
            input = el('select');
            (field.options || []).forEach((opt) => {
                const option = el('option', null, opt.label);
                option.value = opt.value;
                input.append(option);
            });
        } else {
            input = el('input');
            input.type = 'text';
        }

        input.id = id;
        if (field.placeholder) input.placeholder = field.placeholder;
        input.value = getIn(state.content, absPath) == null ? '' : String(getIn(state.content, absPath));

        const handler = () => {
            setIn(state.content, absPath, input.value);
            syncQuickBar();

            if (field.afterChange) {
                field.afterChange(input.value);
                // afterChange can rewrite sibling fields, so redraw the panel.
                showSection(state.activeSection);
            }
            markDirty();
        };
        input.addEventListener(field.type === 'select' ? 'change' : 'input', handler);

        wrap.append(input);
        if (field.hint) wrap.append(el('p', 'hint', field.hint));
        return wrap;
    }

    function buildStringList(field, absPath) {
        const container = el('div', 'strlist');
        const values = Array.isArray(getIn(state.content, absPath)) ? getIn(state.content, absPath) : [];

        const rebuild = () => {
            const fresh = buildStringList(field, absPath);
            container.replaceWith(fresh);
        };

        values.forEach((value, index) => {
            const row = el('div', 'strlist-row');
            row.append(el('span', 'grip', String(index + 1)));

            const input = field.multiline ? el('textarea') : el('input');
            if (field.multiline) input.rows = 2;
            else input.type = 'text';
            input.value = value == null ? '' : String(value);
            input.setAttribute('aria-label', `${labelFor(field)} ${index + 1}`);
            input.addEventListener('input', () => {
                getIn(state.content, absPath)[index] = input.value;
                markDirty();
            });
            row.append(input);

            const tools = el('div', 'strlist-tools');
            tools.append(
                iconButton('↑', 'Move up', index === 0, () => {
                    const arr = getIn(state.content, absPath);
                    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
                    onEdit();
                    rebuild();
                }),
                iconButton('↓', 'Move down', index === values.length - 1, () => {
                    const arr = getIn(state.content, absPath);
                    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
                    onEdit();
                    rebuild();
                }),
                iconButton('✕', 'Remove', false, () => {
                    getIn(state.content, absPath).splice(index, 1);
                    onEdit();
                    rebuild();
                }, 'remove')
            );
            row.append(tools);
            container.append(row);
        });

        if (!values.length) {
            container.append(el('p', 'hint', `No ${field.itemLabel || 'item'}s yet.`));
        }

        const add = el('button', 'btn ghost small', `+ Add ${field.itemLabel || 'item'}`);
        add.type = 'button';
        add.addEventListener('click', () => {
            const arr = getIn(state.content, absPath);
            if (Array.isArray(arr)) arr.push('');
            else setIn(state.content, absPath, ['']);
            onEdit();
            rebuild();
            const rows = document.querySelector(`[data-field-path="${absPath.join('.')}"] .strlist`);
            const inputs = rows ? rows.querySelectorAll('input, textarea') : [];
            if (inputs.length) inputs[inputs.length - 1].focus();
        });

        const addWrap = el('div', 'add-row');
        addWrap.append(add);
        container.append(addWrap);
        return container;
    }

    function buildObjectList(field, absPath) {
        const container = el('div', 'objlist');
        const items = Array.isArray(getIn(state.content, absPath)) ? getIn(state.content, absPath) : [];
        const pathKey = absPath.join('.');

        const rebuild = () => container.replaceWith(buildObjectList(field, absPath));

        items.forEach((item, index) => {
            const openKey = `${pathKey}#${index}`;
            const isOpen = state.openItems.has(openKey);

            const card = el('div', `objitem${isOpen ? ' open' : ''}`);

            const head = el('div', 'objitem-head');
            head.setAttribute('role', 'button');
            head.setAttribute('tabindex', '0');
            head.setAttribute('aria-expanded', String(isOpen));

            head.append(el('span', 'objitem-index', String(index + 1)));

            const title = el('span', 'objitem-title');
            title.append(document.createTextNode(field.titleFrom ? field.titleFrom(item) : `Item ${index + 1}`));
            const subtitle = field.subtitleFrom ? field.subtitleFrom(item) : '';
            if (subtitle) {
                title.append(el('span', 'muted', ` — ${subtitle}`));
            }
            head.append(title);

            const tools = el('div', 'strlist-tools');
            tools.style.flexDirection = 'row';
            tools.append(
                iconButton('↑', 'Move up', index === 0, (e) => {
                    e.stopPropagation();
                    const arr = getIn(state.content, absPath);
                    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
                    state.openItems.clear();
                    onEdit();
                    rebuild();
                }),
                iconButton('↓', 'Move down', index === items.length - 1, (e) => {
                    e.stopPropagation();
                    const arr = getIn(state.content, absPath);
                    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
                    state.openItems.clear();
                    onEdit();
                    rebuild();
                }),
                iconButton('✕', 'Remove', false, (e) => {
                    e.stopPropagation();
                    const name = field.titleFrom ? field.titleFrom(item) : `item ${index + 1}`;
                    if (!window.confirm(`Delete "${name}"? This cannot be undone until you reload without publishing.`)) return;
                    getIn(state.content, absPath).splice(index, 1);
                    state.openItems.clear();
                    onEdit();
                    rebuild();
                }, 'remove')
            );
            head.append(tools, el('span', 'objitem-caret', '▾'));

            const body = el('div', 'objitem-body');
            body.hidden = !isOpen;
            (field.itemFields || []).forEach((sub) => {
                body.append(mountField(sub, absPath.concat(index, sub.path.split('.'))));
            });

            const toggle = () => {
                const nowOpen = !state.openItems.has(openKey);
                if (nowOpen) state.openItems.add(openKey);
                else state.openItems.delete(openKey);
                card.classList.toggle('open', nowOpen);
                body.hidden = !nowOpen;
                head.setAttribute('aria-expanded', String(nowOpen));
            };

            head.addEventListener('click', toggle);
            head.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });

            card.append(head, body);
            container.append(card);
        });

        if (!items.length) {
            container.append(
                el('p', 'empty-note', `Nothing here yet. This section stays hidden on the site until you add something.`)
            );
        }

        const add = el('button', 'btn ghost small', `+ Add ${field.itemLabel || 'item'}`);
        add.type = 'button';
        add.addEventListener('click', () => {
            const blank = {};
            (field.itemFields || []).forEach((sub) => {
                blank[sub.path] = sub.type === 'stringList' ? [] : '';
            });
            const arr = getIn(state.content, absPath);
            if (Array.isArray(arr)) arr.push(blank);
            else setIn(state.content, absPath, [blank]);

            state.openItems.clear();
            state.openItems.add(`${pathKey}#${(getIn(state.content, absPath) || []).length - 1}`);
            onEdit();
            rebuild();
        });

        const addWrap = el('div', 'add-row');
        addWrap.append(add);
        container.append(addWrap);
        return container;
    }

    function iconButton(glyph, title, disabled, onClick, extraClass) {
        const btn = el('button', `icon-btn${extraClass ? ` ${extraClass}` : ''}`, glyph);
        btn.type = 'button';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.disabled = Boolean(disabled);
        btn.addEventListener('click', onClick);
        return btn;
    }


    /* ============================================================
       PANELS & SIDEBAR
       ============================================================ */

    function countFor(section) {
        const listField = (section.fields || []).find((f) => f.type === 'objectList');
        if (!listField) return null;
        const path = section.root.concat(listField.path ? listField.path.split('.') : []);
        const arr = getIn(state.content, path);
        return Array.isArray(arr) ? arr.length : 0;
    }

    function renderSidebar() {
        const nav = $('#sideNav');
        nav.innerHTML = '';
        SCHEMA.forEach((section) => {
            const btn = el('button', section.key === state.activeSection ? 'active' : null);
            btn.type = 'button';
            btn.append(el('span', null, section.label));

            const count = countFor(section);
            if (count !== null) btn.append(el('span', 'count', String(count)));

            btn.addEventListener('click', () => showSection(section.key));
            nav.append(btn);
        });
    }

    function showSection(key) {
        state.activeSection = key;
        state.openItems.clear();

        const section = SCHEMA.find((s) => s.key === key);
        const panels = $('#panels');
        panels.innerHTML = '';

        const panel = el('div', 'panel');
        const head = el('div', 'panel-head');
        head.append(el('h2', null, section.title || section.label));
        if (section.desc) head.append(el('p', null, section.desc));
        panel.append(head);

        const card = el('div', 'card');
        section.fields.forEach((field) => {
            const absPath = section.root.concat(field.path ? field.path.split('.') : []);
            card.append(mountField(field, absPath));
        });
        panel.append(card);

        if (section.custom === 'settings') panel.append(buildSettingsExtras());

        panels.append(panel);
        renderSidebar();
        window.scrollTo({ top: 0 });
    }


    /* ============================================================
       SETTINGS EXTRAS: resume upload + contact-form delivery
       ============================================================ */

    function buildSettingsExtras() {
        const frag = document.createDocumentFragment();

        /* ---- resume ---- */
        const resumeCard = el('div', 'card');
        resumeCard.append(el('h3', null, 'Resume file'));
        resumeCard.append(
            el('p', 'hint', 'Pick a PDF and it replaces the file visitors download. The path on the site never changes, so any link you have already shared keeps working.')
        );

        const upload = el('div', 'upload');
        const meta = el('div', 'upload-meta');
        meta.append(el('strong', null, state.content.config.resumePath || 'assets/resume.pdf'));
        meta.append(el('span', null, 'No new file chosen'));
        upload.append(meta);

        const picker = el('input');
        picker.type = 'file';
        picker.accept = 'application/pdf';
        picker.hidden = true;

        const chooseBtn = el('button', 'btn ghost', 'Choose PDF');
        chooseBtn.type = 'button';
        chooseBtn.addEventListener('click', () => picker.click());

        const uploadBtn = el('button', 'btn primary', 'Upload resume');
        uploadBtn.type = 'button';
        uploadBtn.disabled = true;

        picker.addEventListener('change', () => {
            const file = picker.files && picker.files[0];
            if (!file) return;
            meta.querySelector('span').textContent =
                `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
            uploadBtn.disabled = state.offline;
        });

        const resumeStatus = el('p', 'status');

        uploadBtn.addEventListener('click', async () => {
            const file = picker.files && picker.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                resumeStatus.className = 'status err';
                resumeStatus.textContent = 'That file is over 5 MB. Please export a smaller PDF.';
                return;
            }

            uploadBtn.disabled = true;
            resumeStatus.className = 'status busy';
            resumeStatus.textContent = 'Uploading…';

            try {
                const path = state.content.config.resumePath || 'assets/resume.pdf';
                const base64 = await fileToBase64(file);
                const sha = await api.sha(path);
                await api.write(path, base64, 'Update resume via admin panel', sha);

                resumeStatus.className = 'status ok';
                resumeStatus.textContent =
                    'Resume uploaded. It will be live on the site in about a minute, once GitHub Pages finishes rebuilding.';
                picker.value = '';
                meta.querySelector('span').textContent = 'No new file chosen';
            } catch (err) {
                resumeStatus.className = 'status err';
                resumeStatus.textContent = err.message;
                uploadBtn.disabled = false;
            }
        });

        upload.append(chooseBtn, uploadBtn, picker);
        resumeCard.append(upload, resumeStatus);
        frag.append(resumeCard);

        /* ---- contact form delivery ---- */
        const formCard = el('div', 'card');
        formCard.append(el('h3', null, 'Contact form delivery'));

        const hint = el('p', 'hint');
        hint.innerHTML =
            'Messages are delivered by <a href="https://web3forms.com" target="_blank" rel="noopener">Web3Forms</a>, ' +
            'which emails them to you and needs no server. Enter your email on their site, confirm it, and paste the ' +
            'access key they give you below. <strong>Until a key is set, the form falls back to opening the ' +
            "visitor's own email app</strong> — which works, but loses anyone who reads mail in a browser.";
        formCard.append(hint);

        formCard.append(
            mountField(
                { path: 'web3formsKey', type: 'text', label: 'Web3Forms access key', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                ['config', 'web3formsKey']
            )
        );

        const testStatus = el('p', 'status');
        const testBtn = el('button', 'btn ghost', 'Send myself a test message');
        testBtn.type = 'button';
        testBtn.addEventListener('click', async () => {
            const key = (state.content.config.web3formsKey || '').trim();
            if (!key) {
                testStatus.className = 'status err';
                testStatus.textContent = 'Add an access key first.';
                return;
            }

            testBtn.disabled = true;
            testStatus.className = 'status busy';
            testStatus.textContent = 'Sending…';

            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        access_key: key,
                        subject: 'Test message from your portfolio admin panel',
                        name: 'Admin panel',
                        email: state.content.profile.email || 'noreply@example.com',
                        message: 'If you are reading this, your contact form is wired up correctly.'
                    })
                });
                const body = await response.json().catch(() => ({}));

                if (response.ok && body.success) {
                    testStatus.className = 'status ok';
                    testStatus.textContent = 'Sent. Check your inbox — and your spam folder the first time.';
                } else {
                    throw new Error(body.message || `Web3Forms returned ${response.status}.`);
                }
            } catch (err) {
                testStatus.className = 'status err';
                testStatus.textContent = err.message;
            } finally {
                testBtn.disabled = false;
            }
        });

        formCard.append(testBtn, testStatus);
        frag.append(formCard);

        return frag;
    }


    /* ============================================================
       QUICK BAR (availability shortcut)
       ============================================================ */

    function syncQuickBar() {
        const availability = state.content.availability || {};
        document.querySelectorAll('#quickStatus button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.status === (availability.status || 'open'));
        });
        $('#quickShowBadge').checked = Boolean(availability.show);
    }

    function initQuickBar() {
        document.querySelectorAll('#quickStatus button').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.content.availability = state.content.availability || {};
                state.content.availability.status = btn.dataset.status;
                applyStatusHeadline(btn.dataset.status);
                syncQuickBar();
                onEdit();
                if (state.activeSection === 'availability') showSection('availability');
            });
        });

        $('#quickShowBadge').addEventListener('change', (e) => {
            state.content.availability = state.content.availability || {};
            state.content.availability.show = e.target.checked;
            onEdit();
            if (state.activeSection === 'availability') showSection('availability');
        });
    }


    /* ============================================================
       SEO TAG PATCHING IN index.html

       Social crawlers do not run JavaScript, so these values have to be
       edited into the HTML itself. Targeted string surgery rather than a
       DOM round-trip, which would reformat the whole file.
       ============================================================ */

    function absoluteUrl(pathOrUrl, siteUrl) {
        const value = String(pathOrUrl || '').trim();
        if (!value) return '';
        if (/^https?:/i.test(value)) return value;
        const base = String(siteUrl || '').trim().replace(/\/+$/, '');
        return `${base}/${value.replace(/^\/+/, '')}`;
    }

    function setSeoTag(html, marker, value) {
        if (value == null || value === '') return html;

        if (marker === 'title') {
            return html.replace(
                /(<title\b[^>]*\bdata-seo="title"[^>]*>)([\s\S]*?)(<\/title>)/i,
                (all, open, _inner, close) => open + escapeHtml(value) + close
            );
        }

        const tagRe = new RegExp(
            `<(meta|link)\\b([^>]*?\\bdata-seo="${escapeRegex(marker)}"[^>]*?)>`,
            'i'
        );
        const match = html.match(tagRe);
        if (!match) return html;

        const attrName = match[1].toLowerCase() === 'link' ? 'href' : 'content';
        const attrRe = new RegExp(`(\\b${attrName}=")([^"]*)(")`, 'i');

        let attrs = match[2];
        attrs = attrRe.test(attrs)
            ? attrs.replace(attrRe, (a, before, _old, after) => before + escapeAttr(value) + after)
            : `${attrs} ${attrName}="${escapeAttr(value)}"`;

        return (
            html.slice(0, match.index) +
            `<${match[1]}${attrs}>` +
            html.slice(match.index + match[0].length)
        );
    }

    function setLdJson(html, data) {
        const json = JSON.stringify(data, null, 6).replace(/</g, '\\u003c');
        return html.replace(
            /(<script\b[^>]*\bid="ldJson"[^>]*>)([\s\S]*?)(<\/script>)/i,
            (all, open, _inner, close) => `${open}\n    ${json}\n    ${close}`
        );
    }

    function patchIndexHtml(html) {
        const seo = state.content.seo || {};
        const config = state.content.config || {};
        const profile = state.content.profile || {};

        const siteUrl = String(config.siteUrl || '').trim().replace(/\/*$/, '/');
        const shareImage = absoluteUrl(seo.ogImage, siteUrl);

        const tags = {
            title: seo.title,
            description: seo.description,
            keywords: seo.keywords,
            canonical: siteUrl,
            'og:title': seo.title,
            'og:description': seo.description,
            'og:image': shareImage,
            'og:url': siteUrl,
            'twitter:title': seo.title,
            'twitter:description': seo.description,
            'twitter:image': shareImage
        };

        let out = html;
        Object.entries(tags).forEach(([marker, value]) => {
            out = setSeoTag(out, marker, value);
        });

        const sameAs = (state.content.socials || [])
            .map((s) => s.url)
            .filter((url) => /^https?:/i.test(url || ''));

        out = setLdJson(out, {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: profile.name || '',
            jobTitle: profile.title || '',
            email: profile.email ? `mailto:${profile.email}` : undefined,
            url: siteUrl,
            address: {
                '@type': 'PostalAddress',
                addressLocality: (profile.location || '').split(',')[0].trim(),
                addressCountry: 'IN'
            },
            sameAs
        });

        return out;
    }


    /* ============================================================
       PUBLISH
       ============================================================ */

    let statusTimer = null;

    function setPublishStatus(message, kind) {
        const node = $('#publishStatus');
        clearTimeout(statusTimer);

        node.className = `publish-status${kind ? ` ${kind}` : ''}`;
        node.innerHTML = '';
        if (!message) return;

        const body = el('span', 'publish-status-text');
        if (kind === 'ok' || kind === 'err') body.innerHTML = message;
        else body.textContent = message;
        node.append(body);

        // Dismissable, because it sits above the action bar and long
        // messages would otherwise sit in the way of the buttons.
        if (kind === 'ok' || kind === 'err') {
            const close = el('button', 'status-close', '✕');
            close.type = 'button';
            close.setAttribute('aria-label', 'Dismiss message');
            close.addEventListener('click', () => setPublishStatus(''));
            node.append(close);
        }

        if (kind === 'ok') {
            statusTimer = setTimeout(() => setPublishStatus(''), 12000);
        }
    }

    async function publish() {
        const btn = $('#publishBtn');
        btn.disabled = true;
        setPublishStatus('Publishing…', 'busy');

        try {
            const contentText = serialiseContent(state.content);

            const existing = await api.read('content.js');
            await api.write(
                'content.js',
                toBase64(contentText),
                'Update site content via admin panel',
                existing ? existing.sha : null
            );

            // Keep the share-preview tags in index.html in step with the
            // SEO fields, since crawlers can't read content.js.
            let metaUpdated = false;
            const indexFile = await api.read('index.html');
            if (indexFile) {
                const patched = patchIndexHtml(indexFile.text);
                if (patched !== indexFile.text) {
                    await api.write(
                        'index.html',
                        toBase64(patched),
                        'Update search and share-preview tags via admin panel',
                        indexFile.sha
                    );
                    metaUpdated = true;
                }
            }

            state.original = clone(state.content);
            markDirty();

            const siteUrl = (state.content.config || {}).siteUrl || '';
            const link = siteUrl
                ? ` <a href="${escapeAttr(siteUrl)}" target="_blank" rel="noopener">Open the site</a>`
                : '';
            setPublishStatus(
                `Published${metaUpdated ? ' (content and share tags)' : ''}. GitHub Pages usually takes ` +
                `30–60 seconds to rebuild, and you may need a hard refresh.${link}`,
                'ok'
            );
        } catch (err) {
            setPublishStatus(escapeHtml(err.message), 'err');
            btn.disabled = false;
        }
    }


    /* ============================================================
       PREVIEW / BACKUP / REVERT / PUBLISH
       ============================================================ */

    function initActions() {
        $('#previewBtn').addEventListener('click', () => {
            try {
                sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state.content));
                window.open('index.html?preview=1', '_blank');
            } catch (err) {
                setPublishStatus('Could not open the preview: ' + escapeHtml(err.message), 'err');
            }
        });

        $('#downloadBtn').addEventListener('click', () => {
            const blob = new Blob([serialiseContent(state.content)], { type: 'text/javascript' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'content.js';
            link.click();
            URL.revokeObjectURL(link.href);
            setPublishStatus(
                state.offline
                    ? 'Downloaded. Upload this content.js to your repository to publish it.'
                    : 'Backup downloaded.',
                'ok'
            );
        });

        $('#revertBtn').addEventListener('click', () => {
            if (!window.confirm('Discard every change you have made since loading this page?')) return;
            state.content = clone(state.original);
            state.openItems.clear();
            syncQuickBar();
            showSection(state.activeSection);
            markDirty();
            setPublishStatus('Changes discarded.', 'ok');
        });

        $('#publishBtn').addEventListener('click', publish);

        $('#disconnectBtn').addEventListener('click', () => {
            if (markDirty() && !window.confirm('You have unsaved changes. Disconnect anyway?')) return;
            localStorage.removeItem(STORE_TOKEN);
            sessionStorage.removeItem(STORE_TOKEN);
            window.location.reload();
        });

        window.addEventListener('beforeunload', (e) => {
            if (JSON.stringify(state.content) !== JSON.stringify(state.original)) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }


    /* ============================================================
       BOOT
       ============================================================ */

    function startEditor(content, offline) {
        state.content = content;
        state.original = clone(content);
        state.offline = Boolean(offline);

        /* Seed any branch the schema expects but the file is missing, so an
           older backup — or a content.js saved before a section existed —
           can't crash the form. Derived from SCHEMA rather than listed by
           hand, so it cannot drift as sections are added. */
        SCHEMA.forEach((section) => {
            const key = section.root[0];
            const current = state.content[key];

            // A section whose only field is a root-level list (metrics,
            // socials) is stored as an array; everything else as an object.
            const wantsArray = section.fields.some(
                (field) => !field.path && field.type === 'objectList'
            );

            if (wantsArray) {
                if (!Array.isArray(current)) state.content[key] = [];
            } else if (!current || typeof current !== 'object' || Array.isArray(current)) {
                state.content[key] = {};
            }
        });
        state.original = clone(state.content);

        $('#gate').hidden = true;
        $('#app').hidden = false;

        $('#repoLine').textContent = offline
            ? 'Offline mode — publishing disabled'
            : `${repo.owner}/${repo.name} · ${repo.branch}`;

        if (offline) {
            $('#publishBtn').disabled = true;
            $('#publishBtn').title = 'Connect to GitHub to publish';
            setPublishStatus(
                'Editing offline. Use <strong>Download backup</strong> when you are done, then upload that content.js to your repository.',
                'ok'
            );
        }

        initQuickBar();
        initActions();
        syncQuickBar();
        showSection('availability');
        markDirty();
    }

    function initGate() {
        const saved = JSON.parse(localStorage.getItem(STORE_REPO) || '{}');
        if (saved.owner) $('#ghOwner').value = saved.owner;
        if (saved.name) $('#ghRepo').value = saved.name;
        if (saved.branch) $('#ghBranch').value = saved.branch;

        const storedToken = localStorage.getItem(STORE_TOKEN) || sessionStorage.getItem(STORE_TOKEN);
        if (storedToken) {
            $('#ghToken').value = storedToken;
            $('#ghRemember').checked = Boolean(localStorage.getItem(STORE_TOKEN));
        }

        $('#ghRemember').addEventListener('change', (e) => {
            $('#rememberWarning').hidden = !e.target.checked;
        });

        $('#offlineBtn').addEventListener('click', () => {
            startEditor(clone(window.SITE_CONTENT || {}), true);
        });

        $('#connectForm').addEventListener('submit', async (event) => {
            event.preventDefault();

            repo.owner = $('#ghOwner').value.trim();
            repo.name = $('#ghRepo').value.trim();
            repo.branch = $('#ghBranch').value.trim() || 'main';
            repo.token = $('#ghToken').value.trim();

            const status = $('#connectStatus');
            const btn = $('#connectBtn');

            if (!repo.owner || !repo.name || !repo.token) {
                status.className = 'status err';
                status.textContent = 'Username, repository and token are all required.';
                return;
            }

            btn.disabled = true;
            status.className = 'status busy';
            status.textContent = 'Checking the token…';

            try {
                const info = await api.repoInfo();
                if (info.permissions && info.permissions.push === false) {
                    throw new Error(
                        'That token can read this repository but not write to it. Give it Contents → Read and write.'
                    );
                }

                status.textContent = 'Loading your content…';
                const file = await api.read('content.js');

                localStorage.setItem(
                    STORE_REPO,
                    JSON.stringify({ owner: repo.owner, name: repo.name, branch: repo.branch })
                );
                if ($('#ghRemember').checked) {
                    localStorage.setItem(STORE_TOKEN, repo.token);
                    sessionStorage.removeItem(STORE_TOKEN);
                } else {
                    sessionStorage.setItem(STORE_TOKEN, repo.token);
                    localStorage.removeItem(STORE_TOKEN);
                }

                // Fall back to the bundled copy if the repo has no content.js yet.
                const loaded = file && file.text.trim()
                    ? parseContentFile(file.text)
                    : clone(window.SITE_CONTENT || {});

                startEditor(loaded, false);
            } catch (err) {
                status.className = 'status err';
                status.textContent = err.message;
                btn.disabled = false;
            }
        });
    }

    initGate();
})();
