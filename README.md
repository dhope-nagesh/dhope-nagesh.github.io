# Portfolio & Blog — Nagesh Dhope

Personal portfolio and technical blog built with Jekyll and hosted on GitHub Pages.

**Live site:** [nageshdhope.me](https://nageshdhope.me)

## Sections

- **About** — Background and professional summary
- **Skills & Technologies** — Languages, frameworks, cloud, databases, DevOps tools
- **Work Experience** — Career history with key achievements
- **Key Projects** — Highlighted projects with tech stacks
- **Education & Certifications** — Academic background and professional certifications
- **Blogs** — Technical articles on Go, Kubernetes, AI/RAG, PostgreSQL, Observability
- **Contact** — Email, LinkedIn, GitHub, YouTube links

## Blog Posts

| Topic | Tags |
|-------|------|
| Building RAG Pipelines Visually with LangFlow | AI, LangFlow |
| PostgreSQL EXPLAIN & ANALYZE Guide | PostgreSQL, Performance |
| Prometheus Metrics for gRPC Services | Go, Observability |
| Building Kubernetes Operators with Kubebuilder | Kubernetes, Go |
| Getting Started with RAG Using LangChain & PostgreSQL | AI, Python, LangChain |
| Designing gRPC Microservices in Go | Go, Microservices |

The blog listing page (`/blog/`) includes multi-select dropdown filters for topics and dates, with a search box in the topics dropdown.

## Tech Stack

- **Static site generator:** Jekyll (via `github-pages` gem)
- **Hosting:** GitHub Pages with automated deployment
- **Styling:** Custom CSS with CSS variables, light/dark theme support and 7 selectable color palettes
- **JavaScript:** Vanilla JS — theme toggle, palette switcher, mobile nav, scroll animations, blog filters, code copy buttons

## Project Structure

```
.
├── _config.yml          # Jekyll configuration
├── _layouts/
│   ├── default.html     # Base layout for blog pages
│   └── post.html        # Individual blog post layout
├── _posts/              # Blog posts (Markdown)
├── assets/
│   ├── favicon.svg
│   ├── photo.jpeg
│   └── NageshDhope_Resume.pdf
├── .github/workflows/
│   └── deploy.yml       # GitHub Pages deployment workflow
├── index.html           # Main portfolio page
├── blog.html            # Blog listing page
├── styles.css           # All styles
├── script.js            # Portfolio page JS
├── Gemfile              # Ruby dependencies
└── .gitignore
```

## Local Development

```bash
# Install dependencies
bundle install

# Serve locally
bundle exec jekyll serve
```

The site will be available at `http://localhost:4000`.

## Deployment

Pushes to `main` trigger the GitHub Actions workflow (`.github/workflows/deploy.yml`) which builds the Jekyll site and deploys to GitHub Pages automatically.

## Features

- Responsive design (mobile, tablet, desktop)
- Light/dark theme toggle with `localStorage` persistence
- Copy-to-clipboard buttons on all code blocks in blog posts
- Blog filtering by topics (with search) and dates
- Smooth scroll and fade-in animations

