/* ============================================================
   PORTFOLIO RENDERER

   Every visible string on this page comes from window.SITE_CONTENT
   (content.js). Nothing here should need editing to change content -
   use admin.html for that.
   ============================================================ */

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- helpers ---------- */

    // Content is author-controlled, but it round-trips through a browser form,
    // so everything interpolated into HTML gets escaped.
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Only allow link targets we can vouch for; blocks javascript: URLs.
    function safeUrl(value) {
        const url = String(value || '').trim();
        if (!url) return '';
        if (/^(https?:|mailto:|tel:|#|\.\/|\/|assets\/)/i.test(url)) return url;
        return '';
    }

    function setText(sel, value) {
        const el = $(sel);
        if (el) el.textContent = value || '';
    }

    function isExternal(url) {
        return /^https?:/i.test(url);
    }

    function list(value) {
        return Array.isArray(value) ? value.filter((v) => v !== '' && v != null) : [];
    }

    /* ------------------------------------------------------------
       Content source. Normally content.js, but the admin panel's
       Preview button stashes an unpublished draft in sessionStorage
       and opens this page with ?preview=1 to render it.
       ------------------------------------------------------------ */

    let content = window.SITE_CONTENT;
    let isPreview = false;

    if (new URLSearchParams(window.location.search).has('preview')) {
        try {
            const draft = sessionStorage.getItem('portfolioDraft');
            if (draft) {
                content = JSON.parse(draft);
                isPreview = true;
            }
        } catch (err) {
            /* fall through to the published content */
        }
    }

    if (!content) {
        document.body.insertAdjacentHTML(
            'afterbegin',
            '<p style="padding:2rem;font-family:sans-serif">Could not load <code>content.js</code>. ' +
            'Make sure it sits next to <code>index.html</code>.</p>'
        );
        return;
    }

    if (isPreview) {
        document.body.insertAdjacentHTML(
            'afterbegin',
            '<div class="preview-flag" role="status">Preview of unpublished changes — visitors still see the live version.</div>'
        );
        document.body.classList.add('has-preview-flag');
    }

    const profile = content.profile || {};
    const config = content.config || {};

    /* ============================================================
       THEME
       ============================================================ */

    const SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M3.5 12h-2M22.5 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';

    const themeToggle = $('#themeToggle');
    const root = document.documentElement;

    function paintThemeToggle() {
        const isDark = root.classList.contains('dark');
        themeToggle.innerHTML = isDark ? SUN : MOON;
        themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    paintThemeToggle();

    themeToggle.addEventListener('click', () => {
        root.classList.toggle('dark');
        localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
        paintThemeToggle();
    });

    /* ============================================================
       RENDER: SEO + IDENTITY
       ============================================================ */

    /* Split so CSS can drop the surname on very narrow phones, where the
       full name would otherwise crowd out the menu button. */
    function renderLogoName(name) {
        const node = $('#logoName');
        if (!node) return;

        const parts = String(name || '').trim().split(/\s+/);
        node.textContent = '';
        if (!parts[0]) return;

        node.append(Object.assign(document.createElement('span'), {
            className: 'logo-first',
            textContent: parts[0]
        }));

        if (parts.length > 1) {
            node.append(Object.assign(document.createElement('span'), {
                className: 'logo-last',
                textContent: ` ${parts.slice(1).join(' ')}`
            }));
        }
    }

    function renderIdentity() {
        renderLogoName(profile.name);
        setText('#heroGreeting', profile.greeting || profile.name);
        setText('#heroTransition', profile.transition || profile.title || '');
        setText('#heroSummary', profile.summary);

        const heroMeta = [profile.location, profile.title].filter(Boolean).join('  ·  ');
        setText('#heroMeta', heroMeta);

        const photo = $('#aboutPhoto');
        if (photo && profile.photo) {
            photo.src = profile.photo;
            photo.alt = profile.name ? `${profile.name}, portrait` : 'Portrait';
        }

        // Resume links all point at one path so the admin upload only has to
        // replace a single file.
        const resumePath = safeUrl(config.resumePath) || 'assets/resume.pdf';
        const downloadName = config.resumeDownloadName || 'resume.pdf';
        ['#headerResume', '#heroResume', '#asideResume'].forEach((sel) => {
            const el = $(sel);
            if (!el) return;
            el.href = resumePath;
            el.setAttribute('download', downloadName);
        });

        setText('#resumeUpdated', config.resumeUpdated ? `Updated ${config.resumeUpdated}` : '');
        setText('#footerNote', (content.footer && content.footer.note) || '');
    }

    /* ============================================================
       RENDER: AVAILABILITY BADGE
       ============================================================ */

    function renderAvailability() {
        const badge = $('#availabilityBadge');
        const a = content.availability || {};
        if (!badge) return;

        if (!a.show || !a.headline) {
            badge.hidden = true;
            return;
        }

        badge.hidden = false;
        badge.className = `hero-badge status-${esc(a.status || 'open')}`;
        badge.innerHTML =
            '<span class="status-dot" aria-hidden="true"></span>' +
            `<span class="status-text">${esc(a.headline)}</span>` +
            (a.detail ? `<span class="status-detail">${esc(a.detail)}</span>` : '');
    }

    /* ============================================================
       RENDER: SECTIONS

       Every optional section starts hidden in index.html, so an empty
       list can never leave a bare heading behind. Each renderer calls
       show() to opt its section back in once it has something to draw.
       ============================================================ */

    function show(sel, hasContent) {
        const node = $(sel);
        if (node) node.hidden = !hasContent;
        return Boolean(hasContent);
    }

    // Bulleted list helper for the many "heading + bullets" blocks below.
    function bullets(values, className) {
        const items = list(values);
        if (!items.length) return '';
        return `<ul class="${className}">${items.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;
    }

    function block(heading, body) {
        if (!body) return '';
        return `<div class="case-block"><h4>${esc(heading)}</h4>${body}</div>`;
    }

    function renderMetrics() {
        const items = list(content.metrics);
        const grid = $('#metricsGrid');
        if (!show('#metrics', items.length)) return;
        grid.innerHTML = items
            .map(
                (m) => `
            <div class="metric">
                <span class="metric-value">${esc(m.value)}</span>
                <span class="metric-label">${esc(m.label)}</span>
                <span class="metric-detail">${esc(m.detail)}</span>
            </div>`
            )
            .join('');
    }

    function renderAbout() {
        const about = content.about || {};
        const paragraphs = list(about.paragraphs);
        if (!show('#about', paragraphs.length)) return;

        setText('#aboutHeading', about.heading || 'About me');
        $('#aboutParagraphs').innerHTML = paragraphs.map((p) => `<p>${esc(p)}</p>`).join('');
    }

    function renderWhyPm() {
        const w = content.whyPm || {};
        const paragraphs = list(w.paragraphs);
        if (!show('#whyPm', paragraphs.length)) return;

        setText('#whyPmHeading', w.heading || 'How I got here');
        $('#whyPmBody').innerHTML = paragraphs.map((p) => `<p>${esc(p)}</p>`).join('');
    }

    function renderApmPitch() {
        const a = content.apmPitch || {};
        const lack = list(a.lack);
        const bring = list(a.bring);
        if (!show('#apmPitch', lack.length || bring.length)) return;

        setText('#apmPitchHeading', a.heading || 'Why hire me for an APM role');
        setText('#apmPitchIntro', a.intro || '');

        show('.ledger-lack', lack.length);
        setText('#apmLackHeading', a.lackHeading || "What I don't have");
        $('#apmLackList').innerHTML = lack.map((v) => `<li>${esc(v)}</li>`).join('');

        show('.ledger-bring', bring.length);
        setText('#apmBringHeading', a.bringHeading || 'What I bring');
        $('#apmBringList').innerHTML = bring.map((v) => `<li>${esc(v)}</li>`).join('');
    }

    function renderPrinciples() {
        const p = content.principles || {};
        const items = list(p.items);
        if (!show('#principles', items.length)) return;

        setText('#principlesHeading', p.heading || 'How I think about product');
        setText('#principlesIntro', p.intro || '');
        $('#principlesGrid').innerHTML = items
            .map(
                (item, i) => `
            <article class="principle">
                <span class="principle-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
                <h3>${esc(item.title)}</h3>
                <p>${esc(item.body)}</p>
            </article>`
            )
            .join('');
    }

    function renderExperience() {
        const exp = content.experience || {};
        const items = list(exp.items);
        if (!show('#experience', items.length)) return;

        setText('#experienceHeading', exp.heading || 'Experience');

        $('#experienceList').innerHTML = items
            .map(
                (job) => `
            <article class="timeline-item">
                <div class="timeline-head">
                    <div>
                        <h3>${esc(job.role)}</h3>
                        <p class="timeline-org">${esc(job.company)}${job.location ? ` · ${esc(job.location)}` : ''}</p>
                    </div>
                    <span class="timeline-dates">${esc(job.start)}${job.end ? ` – ${esc(job.end)}` : ' – Present'}</span>
                </div>

                ${job.summary ? `<p class="timeline-summary">${esc(job.summary)}</p>` : ''}
                ${job.scope ? `<p class="timeline-scope"><span>Scope</span>${esc(job.scope)}</p>` : ''}

                ${list(job.bullets).length
                        ? `<ul class="timeline-bullets">${list(job.bullets).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
                        : ''
                    }

                ${list(job.tags).length
                        ? `<div class="tag-row">${list(job.tags).map((t) => `<span>${esc(t)}</span>`).join('')}</div>`
                        : ''
                    }
            </article>`
            )
            .join('');
    }

    // Shared card chrome for products, case studies, teardowns and experiments.
    function caseCard(item, blocks, links) {
        const rows = (links || []).filter((l) => l.url);
        return `
            <article class="case">
                <header class="case-head">
                    <div class="case-title">
                        <h3>${esc(item.title)}</h3>
                        ${item.subtitle ? `<p class="case-sub">${esc(item.subtitle)}</p>` : ''}
                    </div>
                    ${item.status ? `<span class="case-status">${esc(item.status)}</span>` : ''}
                </header>

                ${item.role ? `<p class="case-role">${esc(item.role)}</p>` : ''}

                ${blocks.filter(Boolean).join('')}

                ${list(item.tags).length
                ? `<div class="tag-row">${list(item.tags).map((t) => `<span>${esc(t)}</span>`).join('')}</div>`
                : ''
            }

                ${rows.length
                ? `<div class="case-links">${rows
                    .map(
                        (l) =>
                            `<a href="${esc(l.url)}" ${isExternal(l.url) ? 'target="_blank" rel="noopener"' : ''}>${l.label} &rarr;</a>`
                    )
                    .join('')}</div>`
                : ''
            }
            </article>`;
    }

    function renderProjects() {
        const pj = content.projects || {};
        const items = list(pj.items);
        if (!show('#projects', items.length)) return;

        setText('#projectsHeading', pj.heading || "Products I've built end to end");
        setText('#projectsIntro', pj.intro || '');

        $('#projectsGrid').innerHTML = items
            .map((p) =>
                caseCard(
                    p,
                    [
                        block('The problem', p.problem ? `<p>${esc(p.problem)}</p>` : ''),
                        block('Who it is for', p.user ? `<p>${esc(p.user)}</p>` : ''),
                        block('Evidence', bullets(p.evidence, 'case-decisions')),
                        block('Decisions I made', bullets(p.decisions, 'case-decisions')),
                        block('What shipped', p.outcome ? `<p>${esc(p.outcome)}</p>` : ''),
                        block('How I measure it', bullets(p.metrics, 'case-decisions')),
                        block('Risks and open questions', bullets(p.risks, 'case-decisions'))
                    ],
                    [
                        { url: safeUrl(p.live), label: 'View it live' },
                        { url: safeUrl(p.github), label: 'Source' }
                    ]
                )
            )
            .join('');
    }

    function renderCaseStudies() {
        const cs = content.caseStudies || {};
        const items = list(cs.items);
        if (!show('#caseStudies', items.length)) return;

        setText('#caseStudiesHeading', cs.heading || 'Product case studies');
        setText('#caseStudiesIntro', cs.intro || '');

        $('#caseStudiesList').innerHTML = items
            .map((c) =>
                caseCard(
                    c,
                    [
                        block('The problem', c.problem ? `<p>${esc(c.problem)}</p>` : ''),
                        block('Who it affects', c.user ? `<p>${esc(c.user)}</p>` : ''),
                        block('Evidence', bullets(c.evidence, 'case-decisions')),
                        block('Root cause', c.rootCause ? `<p>${esc(c.rootCause)}</p>` : ''),
                        block('What I would build', c.solution ? `<p>${esc(c.solution)}</p>` : ''),
                        block('How I would prioritise it', c.prioritisation ? `<p>${esc(c.prioritisation)}</p>` : ''),
                        block('Success metrics', bullets(c.metrics, 'case-decisions')),
                        block('Risks', bullets(c.risks, 'case-decisions'))
                    ],
                    [{ url: safeUrl(c.url), label: 'Read the full study' }]
                )
            )
            .join('');
    }

    function renderTeardowns() {
        const td = content.teardowns || {};
        const items = list(td.items);
        if (!show('#teardowns', items.length)) return;

        setText('#teardownsHeading', td.heading || 'Product teardowns');
        setText('#teardownsIntro', td.intro || '');

        $('#teardownsList').innerHTML = items
            .map((t) =>
                caseCard(
                    t,
                    [
                        block('Core value proposition', t.valueProp ? `<p>${esc(t.valueProp)}</p>` : ''),
                        block('User journey', t.journey ? `<p>${esc(t.journey)}</p>` : ''),
                        block('Growth loops', bullets(t.growthLoops, 'case-decisions')),
                        block('What works', bullets(t.strengths, 'case-decisions')),
                        block('What does not', bullets(t.weaknesses, 'case-decisions')),
                        block('What I would remove', bullets(t.wouldRemove, 'case-decisions')),
                        block('What I would add', bullets(t.wouldAdd, 'case-decisions'))
                    ],
                    [{ url: safeUrl(t.url), label: 'Read the full teardown' }]
                )
            )
            .join('');
    }

    function renderExperiments() {
        const ex = content.experiments || {};
        const items = list(ex.items);
        if (!show('#experiments', items.length)) return;

        setText('#experimentsHeading', ex.heading || 'Experiments');
        setText('#experimentsIntro', ex.intro || '');

        $('#experimentsList').innerHTML = items
            .map((e) =>
                caseCard(
                    e,
                    [
                        block('Hypothesis', e.hypothesis ? `<p>${esc(e.hypothesis)}</p>` : ''),
                        block('What I built', bullets(e.built, 'case-decisions')),
                        block('Results', bullets(e.results, 'case-decisions')),
                        block('What I learned', bullets(e.learnings, 'case-decisions'))
                    ],
                    [{ url: safeUrl(e.url), label: 'See it' }]
                )
            )
            .join('');
    }

    function renderFrameworks() {
        const fw = content.frameworks || {};
        const items = list(fw.items);
        if (!show('#frameworks', items.length)) return;

        setText('#frameworksHeading', fw.heading || 'Frameworks I reach for');
        setText('#frameworksIntro', fw.intro || '');

        $('#frameworksList').innerHTML = items
            .map(
                (f) => `
            <div class="framework-row">
                <span class="framework-topic">${esc(f.topic)}</span>
                <span class="framework-name">${esc(f.framework)}</span>
                ${f.note ? `<span class="framework-note">${esc(f.note)}</span>` : ''}
            </div>`
            )
            .join('');
    }

    function renderObservations() {
        const ob = content.observations || {};
        const items = list(ob.items);
        if (!show('#observations', items.length)) return;

        setText('#observationsHeading', ob.heading || 'Product observations');
        setText('#observationsIntro', ob.intro || '');

        $('#observationsList').innerHTML = items
            .map(
                (o) => `
            <article class="observation">
                <div class="observation-meta">
                    ${o.product ? `<span class="observation-product">${esc(o.product)}</span>` : ''}
                    ${o.date ? `<span class="observation-date">${esc(o.date)}</span>` : ''}
                </div>
                <p>${esc(o.text)}</p>
            </article>`
            )
            .join('');
    }

    function renderLearning() {
        const lr = content.learning || {};
        const items = list(lr.items);
        if (!show('#learning', items.length)) return;

        setText('#learningHeading', lr.heading || "What I'm learning");
        setText('#learningIntro', lr.intro || '');

        $('#learningList').innerHTML = items
            .map(
                (l) => `
            <div class="learning-item">
                <h3>${esc(l.label)}</h3>
                ${l.detail ? `<p>${esc(l.detail)}</p>` : ''}
            </div>`
            )
            .join('');
    }

    function renderSkills() {
        const sk = content.skills || {};
        const groups = list(sk.groups);
        if (!show('#skills', groups.length)) return;

        setText('#skillsHeading', sk.heading || 'Skills');
        $('#skillsGrid').innerHTML = groups
            .map(
                (g) => `
            <div class="skill-group">
                <h3>${esc(g.group)}</h3>
                <ul>${list(g.items).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>`
            )
            .join('');
    }

    function renderWriting() {
        const w = content.writing || {};
        const items = list(w.items);
        if (!show('#writing', items.length)) return;

        setText('#writingHeading', w.heading || 'Product writing');
        setText('#writingIntro', w.intro || '');

        $('#writingList').innerHTML = items
            .map((item) => {
                const url = safeUrl(item.url);
                const tag = url ? 'a' : 'div';
                const attrs = url ? ` href="${esc(url)}" target="_blank" rel="noopener"` : '';
                return `
            <${tag} class="writing-item"${attrs}>
                <div class="writing-meta">
                    ${item.type ? `<span class="writing-type">${esc(item.type)}</span>` : ''}
                    ${item.date ? `<span class="writing-date">${esc(item.date)}</span>` : ''}
                </div>
                <h3>${esc(item.title)}</h3>
                ${item.description ? `<p>${esc(item.description)}</p>` : ''}
            </${tag}>`;
            })
            .join('');
    }

    function renderEducation() {
        const edu = content.education || {};
        const items = list(edu.items);
        const certs = content.certifications || {};
        const certItems = list(certs.items);

        if (!show('#education', items.length || certItems.length)) return;

        show('#eduBlock', items.length);
        setText('#educationHeading', edu.heading || 'Education');
        $('#educationList').innerHTML = items
            .map(
                (e) => `
            <article class="edu-item">
                <h3>${esc(e.degree)}</h3>
                <p class="edu-org">${esc(e.school)}${e.location ? ` · ${esc(e.location)}` : ''}</p>
                <p class="edu-dates">${esc(e.start)}${e.end ? ` – ${esc(e.end)}` : ''}</p>
                ${e.detail ? `<p class="edu-detail">${esc(e.detail)}</p>` : ''}
            </article>`
            )
            .join('');

        if (!show('#certsBlock', certItems.length)) return;
        setText('#certificationsHeading', certs.heading || 'Courses & certifications');
        $('#certificationsList').innerHTML = certItems
            .map((c) => {
                const url = safeUrl(c.url);
                return `
            <article class="edu-item">
                <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name)}</h3>
                <p class="edu-org">${esc(c.issuer)}</p>
                <p class="edu-dates">${esc(c.date)}</p>
            </article>`;
            })
            .join('');
    }

    function renderContact() {
        const c = content.contact || {};
        setText('#contactHeading', c.heading || 'Get in touch');
        setText('#contactBlurb', c.blurb || '');
        setText('#contactDirectHeading', c.directHeading || 'Or reach me directly');

        const socials = list(content.socials);

        $('#socialsList').innerHTML = socials
            .map((s) => {
                const url = safeUrl(s.url);
                if (!url) return '';
                return `
            <li>
                <a href="${esc(url)}" ${isExternal(url) ? 'target="_blank" rel="noopener"' : ''}>
                    <span class="link-label">${esc(s.label)}</span>
                    <span class="link-value">${esc(s.handle)}</span>
                </a>
            </li>`;
            })
            .join('');

        $('#footerLinks').innerHTML = socials
            .map((s) => {
                const url = safeUrl(s.url);
                if (!url) return '';
                return `<a href="${esc(url)}" ${isExternal(url) ? 'target="_blank" rel="noopener"' : ''}>${esc(s.label)}</a>`;
            })
            .join('');
    }

    renderIdentity();
    renderAvailability();
    renderMetrics();
    renderAbout();
    renderWhyPm();
    renderCaseStudies();
    renderProjects();
    renderTeardowns();
    renderExperiments();
    renderPrinciples();
    renderFrameworks();
    renderObservations();
    renderExperience();
    renderSkills();
    renderLearning();
    renderWriting();
    renderApmPitch();
    renderEducation();
    renderContact();

    /* A nav link pointing at a section with no content is a dead end, so
       drop those links once we know what actually rendered. */
    $$('#primaryNav a[href^="#"]').forEach((link) => {
        const target = document.querySelector(link.getAttribute('href'));
        link.hidden = !target || target.hidden;
    });

    // Same for the hero's primary call to action.
    (function pickHeroCta() {
        const cta = $('#heroWorkCta');
        if (!cta) return;

        const preferred = ['#caseStudies', '#projects', '#teardowns', '#experiments', '#principles'];
        const target = preferred.find((sel) => {
            const node = $(sel);
            return node && !node.hidden;
        });

        if (target) cta.setAttribute('href', target);
        else cta.hidden = true;
    })();

    /* ============================================================
       HEADER: hide on scroll down, scroll progress, back to top
       ============================================================ */

    const header = $('#siteHeader');
    const progressBar = $('#scrollProgressBar');
    const backToTop = $('#backToTop');
    let lastScrollY = window.scrollY;

    function onScroll() {
        const y = window.scrollY;

        header.classList.toggle('scrolled', y > 20);

        // Keep the header visible whenever the mobile menu is open, otherwise
        // the links you're trying to tap slide away.
        if (!header.classList.contains('nav-open')) {
            header.classList.toggle('hidden', y > lastScrollY && y > 120);
        }

        const max = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.width = max > 0 ? `${(y / max) * 100}%` : '0%';

        backToTop.hidden = y < 600;
        lastScrollY = y;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });

    /* ============================================================
       NAVIGATION: mobile menu, smooth scroll, active-section highlight
       ============================================================ */

    const nav = $('#primaryNav');
    const navToggle = $('#navToggle');

    function closeNav() {
        header.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open menu');
    }

    navToggle.addEventListener('click', () => {
        const open = header.classList.toggle('nav-open');
        navToggle.setAttribute('aria-expanded', String(open));
        navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeNav();
    });

    // Anchor jumps are offset by the sticky header's height.
    $$('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const id = link.getAttribute('href');
            if (id === '#' || id.length < 2) return;
            const target = document.querySelector(id);
            if (!target) return;

            event.preventDefault();
            closeNav();
            window.scrollTo({
                top: target.getBoundingClientRect().top + window.scrollY - header.offsetHeight + 1,
                behavior: prefersReducedMotion ? 'auto' : 'smooth'
            });
        });
    });

    const navLinks = $$('#primaryNav a').filter((link) => !link.hidden);
    const watched = navLinks
        .map((link) => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (watched.length) {
        const spy = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    navLinks.forEach((l) =>
                        l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`)
                    );
                });
            },
            // Band across the upper-middle of the viewport: whatever crosses it
            // is what the reader is looking at.
            { rootMargin: '-25% 0px -65% 0px' }
        );
        watched.forEach((s) => spy.observe(s));
    }

    /* ============================================================
       SCROLL-IN ANIMATIONS
       ============================================================ */

    if (prefersReducedMotion) {
        $$('[data-animate]').forEach((el) => el.classList.add('animate-in'));
    } else {
        const reveal = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('animate-in');
                    obs.unobserve(entry.target);
                });
            },
            { threshold: 0.08 }
        );
        $$('[data-animate]').forEach((el) => reveal.observe(el));
    }

    /* ============================================================
       CONTACT FORM

       Posts to Web3Forms when a key is configured. With no key it falls
       back to opening the visitor's mail client with the message
       pre-filled, so the form is never a dead end.
       ============================================================ */

    (function initForm() {
        const form = $('#contactForm');
        const status = $('#formStatus');
        const submit = $('#contactSubmit');
        if (!form) return;

        const fields = {
            name: { el: $('#name'), error: $('#nameError'), label: 'your name' },
            email: { el: $('#email'), error: $('#emailError'), label: 'your email' },
            message: { el: $('#message'), error: $('#messageError'), label: 'a message' }
        };

        function setStatus(message, kind) {
            status.textContent = message;
            status.className = `form-status${kind ? ` is-${kind}` : ''}`;
        }

        function showError(key, message) {
            fields[key].error.textContent = message;
            fields[key].el.classList.toggle('invalid', Boolean(message));
            fields[key].el.setAttribute('aria-invalid', message ? 'true' : 'false');
        }

        function validate() {
            let firstInvalid = null;

            Object.entries(fields).forEach(([key, field]) => {
                const value = field.el.value.trim();
                let message = '';

                if (!value) {
                    message = `Please enter ${field.label}.`;
                } else if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
                    message = 'That email address doesn\'t look right.';
                } else if (key === 'message' && value.length < 10) {
                    message = 'A little more detail would help.';
                }

                showError(key, message);
                if (message && !firstInvalid) firstInvalid = field.el;
            });

            if (firstInvalid) firstInvalid.focus();
            return !firstInvalid;
        }

        Object.entries(fields).forEach(([key, field]) => {
            field.el.addEventListener('input', () => {
                if (field.el.classList.contains('invalid')) showError(key, '');
            });
        });

        function mailtoFallback(values) {
            const to = profile.email;
            if (!to) {
                setStatus('The form isn\'t connected yet. Please use one of the links on the right.', 'error');
                return;
            }
            const subject = encodeURIComponent(`Portfolio enquiry from ${values.name}`);
            const body = encodeURIComponent(`${values.message}\n\n—\n${values.name}\n${values.email}`);
            window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
            setStatus('Opening your email app with the message ready to send.', 'ok');
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (form.botcheck && form.botcheck.checked) return;
            if (!validate()) return;

            const values = {
                name: fields.name.el.value.trim(),
                email: fields.email.el.value.trim(),
                message: fields.message.el.value.trim()
            };

            const key = (config.web3formsKey || '').trim();
            if (!key) {
                mailtoFallback(values);
                return;
            }

            submit.disabled = true;
            const originalLabel = submit.textContent;
            submit.textContent = 'Sending…';
            setStatus('');

            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        access_key: key,
                        subject: `Portfolio message from ${values.name}`,
                        from_name: 'Portfolio contact form',
                        ...values
                    })
                });
                const result = await response.json().catch(() => ({}));

                if (response.ok && result.success) {
                    form.hidden = true;
                    setStatus((content.contact && content.contact.successMessage) || 'Thanks — message sent.', 'ok');
                } else {
                    throw new Error(result.message || 'Send failed');
                }
            } catch (err) {
                setStatus(
                    'Something went wrong sending that. Opening your email app instead…',
                    'error'
                );
                setTimeout(() => mailtoFallback(values), 900);
            } finally {
                submit.disabled = false;
                submit.textContent = originalLabel;
            }
        });
    })();
})();
