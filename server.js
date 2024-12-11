import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import { extract } from '@extractus/article-extractor';

const app = express();
app.use(cors());
app.use(express.json());

const parser = new Parser();

app.post('/api/parse-feed', async (req, res) => {
  try {
    const { url } = req.body;
    const feed = await parser.parseURL(url);
    res.json({
      title: feed.title,
      items: feed.items.map(item => ({
        title: item.title,
        content: item.content || item.contentSnippet || '',
        link: item.link,
        pubDate: item.pubDate || item.isoDate
      }))
    });
  } catch (error) {
    console.error('Error parsing feed:', error);
    res.status(500).json({ error: 'Failed to parse feed' });
  }
});

app.post('/api/fetch-article', async (req, res) => {
  try {
    const { url } = req.body;
    const article = await extract(url);
    
    if (!article) {
      throw new Error('Failed to extract article content');
    }

    res.json({
      content: article.content || '',
      title: article.title,
      published: article.published
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ error: 'Failed to fetch article content' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 