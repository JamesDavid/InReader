import { db } from './db';
import { addNewFeed } from './feedParser';

export async function importOpml(opmlContent: string): Promise<{ feeds: number; folders: number }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlContent, 'text/xml');
  
  if (doc.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid OPML file');
  }

  const outlines = Array.from(doc.getElementsByTagName('outline'));
  const stats = { feeds: 0, folders: 0 };
  // Key by the outline element itself, not its text. Two folders that happen to
  // share a name (or a nested folder with the same name) would otherwise collide
  // in the map and feeds would be mis-parented.
  const folderMap = new Map<Element, number>();

  // Process folders first (an outline with no xmlUrl is treated as a folder).
  for (const outline of outlines) {
    if (!outline.getAttribute('xmlUrl') && outline.getAttribute('text')) {
      const folderName = outline.getAttribute('text') || 'Unnamed Folder';
      const folder = await db.folders.add({
        name: folderName,
        order: await db.folders.count()
      });
      folderMap.set(outline, folder as number);
      stats.folders++;
    }
  }

  // Process feeds
  for (const outline of outlines) {
    const xmlUrl = outline.getAttribute('xmlUrl');
    if (xmlUrl) {
      try {
        const parentNode = outline.parentElement;
        const folderId = parentNode ? folderMap.get(parentNode) : undefined;

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
  try {
    // Get all feeds with explicit toArray() and error checking
    const feeds = await db.feeds.toArray();

    if (feeds.length === 0) {
      console.warn('No feeds found in database for OPML export');
      return '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>RSS Reader Feeds Export</title></head><body></body></opml>';
    }
    
    const doc = document.implementation.createDocument(null, 'opml', null);
    doc.documentElement.setAttribute('version', '2.0');
    
    const head = doc.createElement('head');
    const title = doc.createElement('title');
    title.textContent = 'RSS Reader Feeds Export';
    const dateCreated = doc.createElement('dateCreated');
    dateCreated.textContent = new Date().toISOString();
    head.appendChild(title);
    head.appendChild(dateCreated);
    doc.documentElement.appendChild(head);
    
    const body = doc.createElement('body');
    
    // Since we have no folders, all feeds should be unorganized
    const unorganizedOutline = doc.createElement('outline');
    unorganizedOutline.setAttribute('text', 'Unorganized');
    unorganizedOutline.setAttribute('title', 'Unorganized');
    
    // Add all feeds to the unorganized section
    for (const feed of feeds) {
      const feedOutline = doc.createElement('outline');
      feedOutline.setAttribute('type', 'rss');
      feedOutline.setAttribute('text', feed.title);
      feedOutline.setAttribute('title', feed.title);
      feedOutline.setAttribute('xmlUrl', feed.url);
      unorganizedOutline.appendChild(feedOutline);
    }
    
    body.appendChild(unorganizedOutline);
    doc.documentElement.appendChild(body);
    
    const serializer = new XMLSerializer();
    const output = serializer.serializeToString(doc);
    
    // Verify the output contains all feeds
    const exportedUrls = output.match(/xmlUrl="([^"]+)"/g)?.length || 0;
    
    if (exportedUrls !== feeds.length) {
      console.error('Not all feeds were exported!', {
        totalFeeds: feeds.length,
        exportedFeeds: exportedUrls,
        output
      });
    }
    
    return output;
  } catch (error) {
    console.error('Error during OPML export:', error);
    throw error;
  }
} 