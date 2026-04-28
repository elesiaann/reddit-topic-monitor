# Reddit Topic Monitor

Watch subreddits for keywords — live in your browser, no login required.

**[Live Demo on GitHub Pages](https://elesiaann.github.io/reddit-topic-monitor/)**

## Features

- Monitor multiple subreddits simultaneously
- Match posts by one or more keywords (ANY or ALL modes)
- Sort by Newest / Top Score / Most Comments
- Auto-refresh on a configurable interval (1 min, 5 min, 10 min, 30 min)
- Keyword highlighting in titles and excerpts
- Filter results in real-time without re-fetching
- Dark / Light theme toggle
- Settings and lists saved to `localStorage` across sessions
- Pure static site — no backend, no API key, no build step

## Usage

1. Enter a subreddit name and click **Add** (or press Enter)
2. Enter one or more keywords (comma-separated) and click **Add**
3. Configure refresh interval, post limit, and sort order
4. Click **Search Now**

## Tech Stack

- Vanilla HTML / CSS / JavaScript (ES2020)
- Reddit public JSON API (`reddit.com/r/{sub}/{sort}.json`)
- GitHub Actions → GitHub Pages for deployment

## Local Development

Just open `index.html` in a browser — no build step needed.

```bash
git clone https://github.com/elesiaann/reddit-topic-monitor
cd reddit-topic-monitor
open index.html   # macOS
# or: start index.html  (Windows)
```

## Deployment

Pushes to `main` automatically deploy via the included GitHub Actions workflow.
Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) in your repo settings.
