# 🎾 Israel Tennis Centers - Court Availability Checker

A simple web application to check tennis court availability at Israel Tennis Centers (ITEC). Built with vanilla JavaScript, deployed on GitHub Pages, with a Cloudflare Worker to handle CORS.

## ✨ Features

- 🔐 **Simple Login** - Login with email, ID number, and tennis center selection
- 📅 **Date Selection** - Browse available dates for the next 14 days
- 🎾 **Court Availability** - View all available courts for each time slot
- 💾 **Session Persistence** - Stays logged in using browser localStorage
- 🚀 **Lightweight** - Pure vanilla JavaScript, no frameworks
- 🔒 **Privacy First** - No data stored on servers, all processing in browser
- ⚡ **Rate Limited** - Respectful API calls to avoid overwhelming the server

## 🏗️ Project Structure

```
israel-tennis-centers/
├── public/                 # Static files for GitHub Pages
│   ├── index.html         # Main HTML file
│   └── styles.css         # CSS styles
├── src/                   # JavaScript modules
│   ├── main.js           # Main application logic
│   ├── api.js            # API and authentication services
│   ├── parser.js         # HTML parsing utilities
│   ├── utils.js          # Date and time utilities
│   └── constants.js      # Tennis centers list
├── api/                   # Cloudflare Worker
│   ├── src/
│   │   └── index.js      # Worker proxy script
│   ├── wrangler.toml     # Cloudflare configuration
│   └── package.json      # Worker dependencies
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions for deployment
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Git
- Node.js (for Cloudflare Worker deployment)
- Cloudflare account (free tier works)
- GitHub account

### Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/adielbm/israel-tennis-centers.git
cd israel-tennis-centers

# Install dependencies (optional, for local development)
npm install
```

### Step 2: Deploy Cloudflare Worker

The Cloudflare Worker acts as a CORS proxy to enable the frontend to communicate with center.tennis.org.il.

1. **Install Wrangler CLI:**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Deploy the Worker:**
   ```bash
   cd api
   wrangler deploy
   ```

4. **Note your Worker URL:**
   After deployment, you'll receive a URL like: `https://itec-cors-proxy.your-subdomain.workers.dev`

### Step 3: Update Worker URL in Frontend

Edit `src/api.js` and update the `WORKER_URL` constant with your actual Cloudflare Worker URL:

```javascript
const WORKER_URL = 'https://itec-cors-proxy.your-subdomain.workers.dev';
```

### Step 4: Deploy to GitHub Pages

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Enable GitHub Pages:**
   - Go to your repository settings on GitHub
   - Navigate to **Pages** section
   - Under **Source**, the GitHub Actions workflow should be automatically detected
   - The site will be deployed to: `https://adielbm.github.io/israel-tennis-centers`

3. **Update Cloudflare Worker CORS Settings (if needed):**
   If you're using a different GitHub username, update `api/wrangler.toml`:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://YOUR-USERNAME.github.io"
   ```
   Then redeploy the worker: `cd api && wrangler deploy`

## 🧪 Local Development

### Run Frontend Locally

```bash
# Using Python 3
npm run dev
# Or manually:
cd public
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

### Test Worker Locally

```bash
npm run worker:dev
# Or:
cd api
wrangler dev
```

## 📖 How It Works

1. **Authentication Flow:**
   - User enters email, ID number, and selects tennis center
   - Frontend makes login request through Cloudflare Worker
   - Session ID and authenticity token are stored in browser localStorage

2. **Court Availability Check:**
   - User selects a date
   - Frontend fetches available time slots from the API
   - For each time slot, frontend checks court availability
   - Results are displayed in a simple, clear interface
   - Requests are batched (3 at a time) with delays to respect the server

3. **CORS Proxy:**
   - Cloudflare Worker proxies all requests to center.tennis.org.il
   - Adds proper CORS headers to allow browser access
   - Only allows requests from the GitHub Pages origin

## 🔒 Privacy & Security

- **No Server-Side Storage:** All user data stays in the browser
- **No Tracking:** No analytics or tracking scripts
- **Session Only:** Login credentials are not stored, only session tokens
- **Origin Restricted:** Cloudflare Worker only accepts requests from your GitHub Pages site

## ⚡ Rate Limiting

To be respectful to center.tennis.org.il servers:
- Requests are batched in groups of 3
- 300ms delay between batches
- Only checks availability for times that the API reports as available

## 🛠️ Configuration

### Tennis Centers

The list of tennis centers is in `src/constants.js`. Update if centers are added or removed.

### Cloudflare Worker Settings

In `api/wrangler.toml`:
- `ALLOWED_ORIGIN`: Your GitHub Pages URL
- `TARGET_BASE_URL`: The tennis center website (shouldn't need to change)

## 📝 License

MIT License - feel free to use and modify!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Known Issues

- Session tokens may expire after some time - just login again
- Court availability is checked in real-time, so results may change quickly
- Some tennis centers may have different operating hours

## 📧 Support

For issues or questions, please open an issue on GitHub.

## 🙏 Acknowledgments

Based on the [raycast-itec](https://github.com/adielbm/raycast-itec) Raycast extension.

---

Made with ❤️ for Israeli tennis players
