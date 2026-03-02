# Deploying to GitHub Pages

## Prerequisites

- A GitHub account
- Git installed on your machine

## Steps

### 1. Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name the repository (e.g., `portfolio-website` or `<your-username>.github.io` for a user site)
3. Set it to **Public**
4. Do **not** initialize with README, .gitignore, or license
5. Click **Create repository**

### 2. Initialize and Push Your Code

```bash
cd /path/to/portfolio_website
git init
git add index.html styles.css script.js assets/
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Pages** (in the left sidebar)
3. Under **Source**, select **Deploy from a branch**
4. Set the branch to **main** and folder to **/ (root)**
5. Click **Save**

### 4. Access Your Site

Your site will be live at:

- **Project site:** `https://<your-username>.github.io/<repo-name>/`
- **User site** (if repo is named `<your-username>.github.io`): `https://<your-username>.github.io/`

Deployment usually takes 1-2 minutes. Check the **Actions** tab in your repository to monitor the build status.

## Custom Domain (Optional)

1. In **Settings** > **Pages**, enter your custom domain under **Custom domain**
2. Add a `CNAME` file to the root of your repository containing your domain:
   ```
   www.yourdomain.com
   ```
3. Configure your domain's DNS:
   - For apex domain (`yourdomain.com`): Add `A` records pointing to GitHub's IPs:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
   - For subdomain (`www.yourdomain.com`): Add a `CNAME` record pointing to `<your-username>.github.io`
4. Check **Enforce HTTPS** once DNS propagation completes

## Updating the Site

Any push to the `main` branch will automatically redeploy:

```bash
git add .
git commit -m "Update portfolio"
git push
```
