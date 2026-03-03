# CLAUDE.md

## Project Overview

Jekyll-based personal portfolio and technical blog for Nagesh Dhope (Staff SDE). Hosted on GitHub Pages at https://dhope-nagesh.github.io.

## Tech Stack

- **Jekyll** via `github-pages` gem — static site generator
- **Vanilla CSS** with CSS custom properties for light/dark theming
- **Vanilla JS** — no frameworks or build tools
- **GitHub Actions** for deployment (`.github/workflows/deploy.yml`)

## Key Files

- `index.html` — Main portfolio page (all sections: nav, hero, about, skills, experience, projects, education, blogs, contact, footer). Blog cards here are **hardcoded HTML**, not from Jekyll loops.
- `blog.html` — Blog listing page at `/blog/`. Uses Jekyll Liquid templates to loop over `site.posts`. Has custom multi-select dropdown filters (topics with search, dates) built with vanilla JS.
- `styles.css` — All styles. Uses CSS variables defined in `:root` and `[data-theme="dark"]`. No preprocessor.
- `script.js` — Portfolio page JS (theme toggle, mobile nav, scroll effects, fade-in animations).
- `_layouts/default.html` — Base layout for blog pages. Contains nav, theme toggle, footer, and copy-to-clipboard JS for code blocks.
- `_layouts/post.html` — Individual blog post layout.
- `_posts/` — Blog posts in Markdown with YAML front matter (`layout`, `title`, `date`, `tags`, `read_time`, `excerpt`).
- `_config.yml` — Jekyll config. Permalink pattern: `/blog/:title/`.

## Common Tasks

### Adding a new blog post
1. Create `_posts/YYYY-MM-DD-slug.md` with front matter: `layout: post`, `title`, `date`, `tags` (array), `read_time`, `excerpt`
2. Add a corresponding hardcoded blog card in `index.html` inside the `blogs-grid` div (blog cards on the portfolio page are NOT auto-generated)
3. Tags will automatically appear in the blog listing page filters

### Local development
```bash
bundle install
bundle exec jekyll serve
# Or with Docker:
docker compose up
```
Site runs at `http://localhost:4000`.

### Deployment
Push to `main` — GitHub Actions builds and deploys automatically.

## Conventions

- No build tools, bundlers, or JS frameworks — keep it vanilla
- CSS variables for all theme colors — never hardcode colors
- Theme variables are in `:root` (light) and `[data-theme="dark"]` (dark) at top of `styles.css`
- Blog post tags should use existing tags when possible: `Go`, `Kubernetes`, `AI`, `Python`, `LangChain`, `LangFlow`, `PostgreSQL`, `Performance`, `Observability`, `Microservices`
- Use `var()` for spacing, colors, shadows, border-radius throughout CSS
- JS uses `var` declarations and `.forEach` style (ES5-compatible, no arrow functions)
