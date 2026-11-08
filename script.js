// Theme & Palette Initial Setup
const savedTheme = localStorage.getItem('theme') || 'light';
const savedPalette = localStorage.getItem('palette') || 'indigo';
document.documentElement.setAttribute('data-theme', savedTheme);
document.documentElement.setAttribute('data-palette', savedPalette);

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
}

// Palette Switcher
const paletteToggle = document.getElementById('paletteToggle');
const paletteMenu = document.getElementById('paletteMenu');

function updateActivePaletteUI(palette) {
    if (!paletteMenu) return;
    paletteMenu.querySelectorAll('.palette-option').forEach(btn => {
        const val = btn.getAttribute('data-palette-val');
        btn.classList.toggle('active', val === palette);
    });
}

if (paletteToggle && paletteMenu) {
    updateActivePaletteUI(savedPalette);

    paletteToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = paletteMenu.classList.toggle('open');
        paletteToggle.setAttribute('aria-expanded', isOpen);
    });

    paletteMenu.querySelectorAll('.palette-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chosen = btn.getAttribute('data-palette-val');
            document.documentElement.setAttribute('data-palette', chosen);
            localStorage.setItem('palette', chosen);
            updateActivePaletteUI(chosen);
            paletteMenu.classList.remove('open');
            paletteToggle.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('click', (e) => {
        if (!paletteMenu.contains(e.target) && !paletteToggle.contains(e.target)) {
            paletteMenu.classList.remove('open');
            paletteToggle.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && paletteMenu.classList.contains('open')) {
            paletteMenu.classList.remove('open');
            paletteToggle.setAttribute('aria-expanded', 'false');
        }
    });
}

// Mobile Navigation Toggle
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

if (navToggle && navMenu) {
    navToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        navMenu.classList.toggle('open');
        navToggle.classList.toggle('active');
    });

    // Close mobile menu on link click
    navMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('open');
            navToggle.classList.remove('active');
        });
    });

    // Close mobile menu on click outside
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('open') && !navMenu.contains(e.target) && !navToggle.contains(e.target)) {
            navMenu.classList.remove('open');
            navToggle.classList.remove('active');
        }
    });

    // Close mobile menu on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('open')) {
            navMenu.classList.remove('open');
            navToggle.classList.remove('active');
        }
    });
}

// Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
});

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

function setActiveLink() {
    const scrollY = window.scrollY + 100;
    const atBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 50);

    if (atBottom) {
        const lastSection = sections[sections.length - 1];
        const lastId = lastSection.getAttribute('id');
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${lastId}`);
        });
        return;
    }

    sections.forEach(section => {
        const top = section.offsetTop - 100;
        const bottom = top + section.offsetHeight;
        const id = section.getAttribute('id');
        if (scrollY >= top && scrollY < bottom) {
            navLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
            });
        }
    });
}

window.addEventListener('scroll', setActiveLink);

// Fade-in animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

// Add fade-in class to animatable elements
document.querySelectorAll('.timeline-item, .project-card, .skill-category, .edu-card, .cert-card, .blog-card, .contact-card, .about-content, .about-stats .stat').forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
});
