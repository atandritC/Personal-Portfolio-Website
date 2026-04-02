/* ============================================================
   DATA
   ============================================================ */

const skills = ['HTML', 'CSS', 'JavaScript', 'React (soon)', 'Git', 'Figma'];

const projects = [
    {
        title: 'Portfolio Website',
        description: 'A personal portfolio with scroll animations, dark mode, particle background, and live GitHub API integration.',
        tags: ['HTML', 'CSS', 'JavaScript'],
        link: '#',
        github: 'https://github.com/atandritC/'
    },
    {
        title: 'Weather App',
        description: 'Fetches live weather data based on your city. Features a clean UI and full error handling.',
        tags: ['JavaScript', 'Fetch API', 'CSS'],
        link: '#',
        github: '#'
    },
    {
        title: 'To-Do List',
        description: 'A clean task manager with localStorage support so your tasks survive page refresh.',
        tags: ['JavaScript', 'localStorage', 'CSS'],
        link: '#',
        github: '#'
    }
];


/* ============================================================
   THEME TOGGLE
   ============================================================ */

const themeToggle = document.querySelector('#themeToggle');
const html = document.querySelector('html');

const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

// Apply saved theme on page load so preference survives refresh
if (localStorage.getItem('theme') === 'dark') {
    html.classList.add('dark');
    themeToggle.innerHTML = sunIcon;
} else {
    themeToggle.innerHTML = moonIcon;
}

themeToggle.addEventListener('click', () => {
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    themeToggle.innerHTML = isDark ? sunIcon : moonIcon;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});


/* ============================================================
   SCROLL: HIDE / SHOW HEADER
   ============================================================ */

const header = document.querySelector('header');
let previousScrollY = 0;

window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > previousScrollY && currentScrollY > 80) {
        header.classList.add('hidden');
    } else {
        header.classList.remove('hidden');
    }

    previousScrollY = currentScrollY;
});


/* ============================================================
   SMOOTH SCROLL
   ============================================================ */

// Override default anchor jump with a smooth scroll that accounts for header height
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', event => {
        event.preventDefault();
        const targetSection = document.querySelector(link.getAttribute('href'));
        window.scrollTo({
            top: targetSection.offsetTop - header.offsetHeight,
            behavior: 'smooth'
        });
    });
});


/* ============================================================
   RENDER SKILLS
   ============================================================ */

const skillsList = document.querySelector('#skillsList');
skillsList.innerHTML = skills.map(skill => `<li>${skill}</li>`).join('');


/* ============================================================
   RENDER PROJECTS
   ============================================================ */

const projectsGrid = document.querySelector('#projectsGrid');

projectsGrid.innerHTML = projects.map(({ title, description, tags, link, github }) => `
    <div class="project-card">
        <h3>${title}</h3>
        <p>${description}</p>
        <div class="project-tags">
            ${tags.map(tag => `<span>${tag}</span>`).join('')}
        </div>
        <div class="project-links">
            <a href="${link}" target="_blank">Live Demo &rarr;</a>
            <a href="${github}" target="_blank">GitHub &rarr;</a>
        </div>
    </div>
`).join('');


/* ============================================================
   SCROLL ANIMATIONS (Intersection Observer)
   Observes elements with [data-animate] and adds .animate-in
   when they enter the viewport, triggering the CSS transition.
   ============================================================ */

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('[data-animate]').forEach(el => {
    observer.observe(el);
});


/* ============================================================
   TYPEWRITER EFFECT
   Cycles through the roles array, typing and deleting each one.
   ============================================================ */

const roles = ['Full Stack Developer', 'UI/UX Enthusiast', 'Open Source Contributor', 'React Developer'];
const typedRole = document.querySelector('#typedRole');
let roleIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeWriter() {
    const currentRole = roles[roleIndex];

    if (isDeleting) {
        typedRole.textContent = currentRole.substring(0, charIndex - 1);
        charIndex--;
    } else {
        typedRole.textContent = currentRole.substring(0, charIndex + 1);
        charIndex++;
    }

    let speed = isDeleting ? 50 : 100;

    if (!isDeleting && charIndex === currentRole.length) {
        speed = 2000;           // pause at the end before deleting
        isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
        speed = 400;            // pause before typing the next role
    }

    setTimeout(typeWriter, speed);
}

typeWriter();


/* ============================================================
   PARTICLE CANVAS
   Draws small floating dots on the hero canvas background.
   ============================================================ */

function initParticles() {
    const canvas = document.querySelector('#particleCanvas');
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }

    resize();
    window.addEventListener('resize', resize);

    // Create 60 particles at random positions
    const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            // Move particle
            p.x += p.vx;
            p.y += p.vy;

            // Wrap around edges instead of bouncing
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            // Draw dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(233, 192, 178, ${p.opacity})`;
            ctx.fill();
        });

        requestAnimationFrame(draw);
    }

    draw();
}

initParticles();


/* ============================================================
   FORM VALIDATION
   ============================================================ */

const contactForm = document.querySelector('#contactForm');
const formSuccess = document.querySelector('#formSuccess');

contactForm.addEventListener('submit', event => {
    event.preventDefault();

    const nameVal = document.querySelector('#name').value.trim();
    const emailVal = document.querySelector('#email').value.trim();
    const messageVal = document.querySelector('#message').value.trim();

    if (nameVal === '' || emailVal === '' || messageVal === '') {
        alert('Please fill in all fields.');
        return;
    }

    contactForm.style.display = 'none';
    formSuccess.style.display = 'block';
});


/* ============================================================
   GITHUB API
   Fetches live repo/follower count and updates the hero description.
   ============================================================ */

async function loadGithubStats() {
    try {
        const response = await fetch('https://api.github.com/users/atandritC');
        const data = await response.json();
        if (data.public_repos !== undefined && data.followers !== undefined) {
            document.querySelector('.hero-desc').textContent =
                `${data.public_repos} public repos · ${data.followers} followers on GitHub`;
        }
    } catch (error) {
        console.log('GitHub API unavailable:', error);
    }
}

loadGithubStats();
