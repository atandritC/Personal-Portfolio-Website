# Personal Portfolio Website

**Developer Portfolio with Interactive Animations**  
A single-page personal portfolio featuring a particle canvas hero, typewriter role cycling, scroll-triggered animations, and dark mode — all built with zero dependencies.

[![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

## 🛠 Tech Stack

**Frontend** — Pure client-side, no build step required
- HTML5 + CSS3 (Flexbox, Grid, custom properties, keyframe animations)
- Vanilla JavaScript (ES6+, Canvas API, Intersection Observer)
- Google Fonts (Inter for body, Poppins for headings)
- No frameworks or bundlers — opens directly in a browser

**Storage**
- `localStorage` for persisting dark/light theme preference across sessions

## ✨ Key Features

- **Particle Canvas Background** — 60 floating particles drawn on an HTML5 canvas behind the hero section, wrapping around screen edges for a seamless loop
- **Typewriter Effect** — Cycles through role titles (Full Stack Developer, UI/UX Enthusiast, etc.) with realistic typing and deleting speeds
- **Dark Mode** — Full theme toggle using CSS custom properties on `:root` and `html.dark`; preference saved to localStorage and restored on reload
- **Scroll Animations** — Sections fade-and-slide into view using Intersection Observer with a `[data-animate]` attribute pattern
- **Auto-Hiding Header** — Sticky navigation bar hides on scroll-down and reappears on scroll-up for a clean reading experience
- **Smooth Scrolling** — Nav links scroll to sections with an offset for the sticky header height
- **Dynamic Content Rendering** — Skills list and project cards are rendered from JavaScript data arrays, making updates trivial
- **Contact Form** — Client-side validation with a success state transition; form hides and a confirmation message appears on submit
- **Responsive Design** — Mobile-friendly layout with CSS Grid and Flexbox that adapts across breakpoints

## 📸 Screenshots

![Hero Section](screenshots/hero.png)
![About Section](screenshots/about.png)
![Projects Section](screenshots/projects.png)
![Contact Section](screenshots/contact.png)

*(Add actual screenshots in a `screenshots/` folder)*

## 🏗 Architecture

- **Single HTML File** — All structure lives in `index.html`; no routing or multi-page setup needed
- **CSS Custom Properties for Theming** — Light and dark palettes defined as CSS variables on `:root` and `html.dark`, enabling a full theme switch by toggling one class
- **Hero Isolation** — Hero section uses its own set of hardcoded color variables (`--hero-*`) so it stays dark regardless of theme, avoiding contrast issues
- **Canvas as Background Layer** — `#particleCanvas` is absolutely positioned behind hero content with `pointer-events: none`, keeping it non-interactive and purely decorative
- **Data-Driven Rendering** — Skills and projects are plain JavaScript arrays at the top of `script.js`; the DOM is built from `.map().join('')` templates, so adding a new project is a single object addition
- **Progressive Enhancement** — The page is fully readable even if JavaScript fails; the form degrades to a standard submission

## ⚙️ How to Run Locally

No server, build step, or dependencies required.

```bash
# Clone the repository
git clone https://github.com/atandritC/Personal-Portfolio-Website.git
cd Personal-Portfolio-Website

# Open directly in your browser
# On Windows:
start index.html

# On macOS:
open index.html

# On Linux:
xdg-open index.html
```

Or use the **Live Server** extension in VS Code / Cursor — right-click `index.html` and select "Open with Live Server".

## 🧠 Challenges Faced & Solutions

| Challenge | Solution |
|---|---|
| Particle canvas resizing caused misaligned dots on window resize | Added a `resize()` listener that resets `canvas.width` and `canvas.height` to match the container's `offsetWidth`/`offsetHeight` |
| Typewriter effect caused layout shifts as text length changed | Set `min-height: 2.2rem` on `.hero-role` so the container stays stable regardless of character count |
| Dark mode toggled hero colors, breaking contrast on the always-dark hero section | Introduced separate `--hero-*` CSS variables that are never overridden by `html.dark`, isolating the hero palette |
| Header covered anchor targets when using smooth scroll | Used `scroll-margin-top` in CSS and subtracted `header.offsetHeight` in the JS scroll offset calculation |

## 📈 What I Learned

- Using the Canvas API to create lightweight particle animations without any animation library
- Building a complete dark/light theme system with CSS custom properties and localStorage
- Implementing Intersection Observer for performant scroll-triggered animations
- Structuring a data-driven UI where content is separated from presentation
- Writing clean, maintainable vanilla JavaScript without relying on frameworks
