import { Feed, Folder, db } from './db';
import { addNewFeed } from './feedParser';

interface OpmlOutline {
  text: string;
  title?: string;
  type?: string;
  xmlUrl?: string;
  htmlUrl?: string;
  children?: OpmlOutline[];
}

export async function importOpml(opmlContent: string): Promise<{ feeds: number; folders: number }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlContent, 'text/xml');
  
  if (doc.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid OPML file');
  }

  const outlines = Array.from(doc.getElementsByTagName('outline'));
  const stats = { feeds: 0, folders: 0 };
  const folderMap = new Map<string, number>();

  // Process folders first
  for (const outline of outlines) {
    if (!outline.getAttribute('xmlUrl') && outline.getAttribute('text')) {
      const folderName = outline.getAttribute('text') || 'Unnamed Folder';
      const folder = await db.folders.add({
        name: folderName,
        order: await db.folders.count()
      });
      folderMap.set(folderName, folder as number);
      stats.folders++;
    }
  }

  // Process feeds
  for (const outline of outlines) {
    const xmlUrl = outline.getAttribute('xmlUrl');
    if (xmlUrl) {
      try {
        const parentNode = outline.parentElement;
        const folderName = parentNode?.getAttribute('text');
        const folderId = folderName ? folderMap.get(folderName) : undefined;
        
        // Check if feed already exists
        const existingFeed = await db.feeds.where('url').equals(xmlUrl).first();
        if (!existingFeed) {
          await addNewFeed(xmlUrl, folderId);
          stats.feeds++;
        }
      } catch (error) {
        console.error(`Failed to import feed ${xmlUrl}:`, error);
        // Continue with other feeds even if one fails
      }
    }
  }

  return stats;
}

export async function exportOpml(): Promise<string> {
  const feeds = await db.feeds.toArray();
  const folders = await db.folders.toArray();
  
  const doc = document.implementation.createDocument(null, 'opml', null);
  doc.documentElement.setAttribute('version', '2.0');
  
  const head = doc.createElement('head');
  const title = doc.createElement('title');
  title.textContent = 'RSS Reader Feeds Export';
  head.appendChild(title);
  doc.documentElement.appendChild(head);
  
  const body = doc.createElement('body');
  
  // Create folder map for quick lookup
  const folderMap = new Map(folders.map(f => [f.id, f]));
  
  // Group feeds by folder
  const feedsByFolder = new Map<number | undefined, Feed[]>();
  feeds.forEach(feed => {
    const list = feedsByFolder.get(feed.folderId) || [];
    list.push(feed);
    feedsByFolder.set(feed.folderId, list);
  });
  
  // Add feeds in folders
  folders.forEach(folder => {
    const folderFeeds = feedsByFolder.get(folder.id);
    if (folderFeeds?.length) {
      const folderOutline = doc.createElement('outline');
      folderOutline.setAttribute('text', folder.name);
      folderOutline.setAttribute('title', folder.name);
      
      folderFeeds.forEach(feed => {
        const feedOutline = doc.createElement('outline');
        feedOutline.setAttribute('type', 'rss');
        feedOutline.setAttribute('text', feed.title);
        feedOutline.setAttribute('title', feed.title);
        feedOutline.setAttribute('xmlUrl', feed.url);
        folderOutline.appendChild(feedOutline);
      });
      
      body.appendChild(folderOutline);
    }
  });
  
  // Add unorganized feeds
  const unorganizedFeeds = feedsByFolder.get(undefined) || [];
  unorganizedFeeds.forEach(feed => {
    const feedOutline = doc.createElement('outline');
    feedOutline.setAttribute('type', 'rss');
    feedOutline.setAttribute('text', feed.title);
    feedOutline.setAttribute('title', feed.title);
    feedOutline.setAttribute('xmlUrl', feed.url);
    body.appendChild(feedOutline);
  });
  
  doc.documentElement.appendChild(body);
  
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
} 