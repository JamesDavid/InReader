import Gun from 'gun';
import 'gun/sea';
import type { FeedEntry, Feed } from './db';
import { getAllFeeds } from './db';

const SEA = (Gun as any).SEA;

interface GunConfig {
  relayServer: string;
  privateKey: string;
  displayName: string;
  shareFeedList: boolean;  // Whether to share feed subscriptions with followers
}

export interface SharedFeed {
  id: number;
  url: string;
  title: string;
  description?: string;
  sharedAt: string;
}

export interface SharedFeedList {
  feeds: SharedFeed[];
  updatedAt: string;
  userName: string;
  userPub: string;
}

export function truncatePublicKey(pubKey: string): string {
  if (!pubKey || pubKey.length < 16) return pubKey;
  return `${pubKey.slice(0, 8)}...${pubKey.slice(-8)}`;
}

class GunService {
  private gun: any = null;
  private user: any = null;
  private config: GunConfig = {
    relayServer: '',
    privateKey: '',
    displayName: '',
    shareFeedList: false
  };
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private connectionListeners: Set<(status: 'disconnected' | 'connecting' | 'connected') => void> = new Set();
  private followedUsers: Set<string> = new Set();
  private followedUsersListeners: Set<(users: string[]) => void> = new Set();

  constructor() {
    // Load config from localStorage
    const savedConfig = localStorage.getItem('gunConfig');
    if (savedConfig) {
      try {
        this.config = JSON.parse(savedConfig);
        this.initGun();
      } catch (error) {
        console.error('Failed to parse Gun config:', error);
        localStorage.removeItem('gunConfig');
      }
    }

    // Load followed users from localStorage
    const savedFollowedUsers = localStorage.getItem('gunFollowedUsers');
    if (savedFollowedUsers) {
      try {
        const users = JSON.parse(savedFollowedUsers);
        users.forEach((user: string) => this.followedUsers.add(user));
      } catch (error) {
        console.error('Failed to parse followed users:', error);
        localStorage.removeItem('gunFollowedUsers');
      }
    }
  }

  private setConnectionStatus(status: 'disconnected' | 'connecting' | 'connected') {
    this.connectionStatus = status;
    this.connectionListeners.forEach(listener => listener(status));
  }

  onConnectionStatusChange(callback: (status: 'disconnected' | 'connecting' | 'connected') => void) {
    this.connectionListeners.add(callback);
    // Immediately call with current status
    callback(this.connectionStatus);
    
    // Return cleanup function
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  async generateKeyPair(): Promise<{ pub: string; priv: string }> {
    try {
      const pair = await SEA.pair();
      return {
        pub: pair.pub,
        priv: JSON.stringify(pair)
      };
    } catch (error) {
      console.error('Error generating key pair:', error);
      throw new Error('Failed to generate key pair');
    }
  }

  private async initGun() {
    if (!this.config.relayServer) return;

    try {
      this.setConnectionStatus('connecting');

      // Initialize Gun with the relay server
      this.gun = Gun({
        peers: [this.config.relayServer],
        localStorage: false, // Use IndexedDB instead of localStorage
        radisk: true, // Enable RadixDB for better performance
      });

      // Set up connection monitoring
      this.gun.on('hi', () => {
        this.setConnectionStatus('connected');
      });

      this.gun.on('bye', () => {
        this.setConnectionStatus('disconnected');
      });

      // Initialize user if we have a private key
      if (this.config.privateKey) {
        this.user = this.gun.user();
        
        try {
          // Parse the stored private key back into a key pair
          const keyPair = JSON.parse(this.config.privateKey);
          
          // Create a promise wrapper for the auth callback
          await new Promise((resolve, reject) => {
            this.user.auth(keyPair, (ack: any) => {
              if (ack.err) {
                console.error('Gun auth error:', ack.err);
                reject(new Error(ack.err));
              } else {
                console.log('Gun auth success');
                resolve(ack);
              }
            });
          });

          // Set display name if not already set
          const name = await new Promise<string>((resolve) => {
            this.user.get('profile').get('name').once((name: string) => {
              resolve(name || '');
            });
          });

          if (!name && this.config.displayName) {
            await new Promise<void>((resolve) => {
              this.user.get('profile').get('name').put(this.config.displayName, () => resolve());
            });
          }

          // Dispatch auth event
          window.dispatchEvent(new CustomEvent('gunAuthChanged'));
        } catch (error) {
          console.error('Error parsing private key:', error);
          throw new Error('Invalid private key format');
        }
      }
    } catch (error) {
      console.error('Failed to initialize Gun:', error);
      this.gun = null;
      this.user = null;
      this.setConnectionStatus('disconnected');
      throw error;
    }
  }

  async updateConfig(newConfig: GunConfig) {
    // Clean up existing Gun instance if any
    if (this.gun) {
      this.gun.off();
      this.gun = null;
      this.user = null;
    }

    this.config = newConfig;
    localStorage.setItem('gunConfig', JSON.stringify(newConfig));
    
    // Initialize new Gun instance
    await this.initGun();
  }

  getConfig(): GunConfig {
    return { ...this.config };
  }

  isAuthenticated(): boolean {
    return !!this.user && !!this.config.privateKey;
  }

  /**
   * Safely get the current user's public key
   * Returns null if not authenticated or key is invalid
   */
  getCurrentUserPubKey(): string | null {
    if (!this.config.privateKey) return null;
    try {
      const keyPair = JSON.parse(this.config.privateKey);
      return keyPair?.pub || null;
    } catch {
      return null;
    }
  }

  async shareItem(entry: FeedEntry, comment?: string) {
    if (!this.gun || !this.user) {
      throw new Error('Gun not initialized or user not authenticated');
    }

    const sharedItem = {
      id: entry.id,
      title: entry.title,
      content: entry.content_fullArticle || entry.content_rssAbstract,
      link: entry.link,
      publishDate: entry.publishDate.toISOString(),
      sharedAt: new Date().toISOString(),
      comment: comment || null,
      sharedBy: {
        pub: this.user.is.pub,
        name: this.config.displayName
      }
    };

    return new Promise((resolve, reject) => {
      // Use a unique ID for each shared item
      const itemId = `${entry.id}_${Date.now()}`;
      
      this.user
        .get('sharedItems')
        .get(itemId)
        .put(sharedItem, (ack: any) => {
          if (ack.err) {
            console.error('Error sharing item:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Item shared successfully:', itemId);
            resolve(sharedItem);
          }
        });
    });
  }

  /**
   * Configuration for fetch timeouts
   */
  private static readonly FETCH_TIMEOUT_MS = 8000;  // Max time to wait for items
  private static readonly FETCH_SETTLE_MS = 1500;   // Time to wait after last item received

  async getSharedItems(userPubKey: string): Promise<any[]> {
    if (!this.gun) {
      throw new Error('Gun not initialized');
    }

    // Check connection status - warn but don't block
    if (this.connectionStatus === 'disconnected') {
      console.warn('Gun is disconnected, fetch may fail or return stale data');
    }

    console.log('Fetching shared items for user:', userPubKey);

    return new Promise((resolve, reject) => {
      const items: any[] = [];
      let isResolved = false;
      let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let maxTimeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        if (settleTimeoutId) clearTimeout(settleTimeoutId);
        clearTimeout(maxTimeoutId);
        // Unsubscribe from Gun listener
        if (subscription && typeof subscription.off === 'function') {
          subscription.off();
        }
      };

      const resolveWithItems = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        const sortedItems = items.sort((a, b) =>
          new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()
        );
        console.log('Resolving with items:', sortedItems.length);
        resolve(sortedItems);
      };

      const handleItem = (item: any, id: string) => {
        if (item && !isResolved) {
          console.log('Received shared item:', { id, item });
          // Avoid duplicates
          if (!items.some(i => i.id === id)) {
            items.push({ ...item, id });
          }

          // Reset settle timeout - wait for more items
          if (settleTimeoutId) clearTimeout(settleTimeoutId);
          settleTimeoutId = setTimeout(resolveWithItems, GunService.FETCH_SETTLE_MS);
        }
      };

      const subscription = this.gun
        .user(userPubKey)
        .get('sharedItems')
        .map()
        .on(handleItem);

      // Start initial settle timeout (in case no items arrive)
      settleTimeoutId = setTimeout(resolveWithItems, GunService.FETCH_SETTLE_MS);

      // Hard max timeout to prevent hanging forever
      maxTimeoutId = setTimeout(() => {
        if (isResolved) return;

        if (items.length > 0) {
          // We have some items, resolve with what we have
          resolveWithItems();
        } else if (this.connectionStatus === 'disconnected') {
          // No items and disconnected - likely a connection issue
          isResolved = true;
          cleanup();
          reject(new Error('Unable to fetch shared items: not connected to relay server'));
        } else {
          // Connected but no items - user just has no shared items
          resolveWithItems();
        }
      }, GunService.FETCH_TIMEOUT_MS);
    });
  }

  async getMySharedItems() {
    if (!this.user) {
      throw new Error('User not authenticated');
    }
    return this.getSharedItems(this.user.is.pub);
  }

  /**
   * Share the user's feed subscription list
   */
  async shareFeedList(feeds: Array<{ id: number; url: string; title: string; description?: string }>) {
    if (!this.gun || !this.user) {
      throw new Error('Gun not initialized or user not authenticated');
    }

    if (!this.config.shareFeedList) {
      throw new Error('Feed list sharing is disabled in settings');
    }

    const sharedFeedList = {
      feeds: feeds.map(feed => ({
        id: feed.id,
        url: feed.url,
        title: feed.title,
        description: feed.description || null,
        sharedAt: new Date().toISOString()
      })),
      updatedAt: new Date().toISOString(),
      userName: this.config.displayName,
      userPub: this.user.is.pub
    };

    return new Promise((resolve, reject) => {
      this.user
        .get('sharedFeedList')
        .put(sharedFeedList, (ack: any) => {
          if (ack.err) {
            console.error('Error sharing feed list:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Feed list shared successfully');
            resolve(sharedFeedList);
          }
        });
    });
  }

  /**
   * Get a user's shared feed subscription list
   */
  async getSharedFeedList(userPubKey: string): Promise<SharedFeedList | null> {
    if (!this.gun) {
      throw new Error('Gun not initialized');
    }

    if (!userPubKey) {
      throw new Error('Public key is required');
    }

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      let isResolved = false;

      const handleFeedList = (data: any) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeoutId);

        if (!data || !data.feeds) {
          resolve(null);
          return;
        }

        // Gun stores arrays in a special way, we need to reconstruct them
        let feeds: SharedFeed[] = [];
        if (Array.isArray(data.feeds)) {
          feeds = data.feeds.filter((f: any) => f && f.url);
        } else if (typeof data.feeds === 'object') {
          // Gun may store arrays as objects with numeric keys
          feeds = Object.values(data.feeds).filter((f: any) => f && f.url) as SharedFeed[];
        }

        resolve({
          feeds,
          updatedAt: data.updatedAt || new Date().toISOString(),
          userName: data.userName || 'Unknown User',
          userPub: userPubKey
        });
      };

      this.gun
        .user(userPubKey)
        .get('sharedFeedList')
        .once(handleFeedList);

      timeoutId = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;

        if (this.connectionStatus === 'disconnected') {
          reject(new Error('Unable to fetch feed list: not connected to relay server'));
        } else {
          // No feed list shared - resolve with null
          resolve(null);
        }
      }, GunService.FETCH_TIMEOUT_MS);
    });
  }

  /**
   * Check if feed list sharing is enabled
   */
  isFeedListSharingEnabled(): boolean {
    return this.config.shareFeedList;
  }

  /**
   * Sync current feed subscriptions to Gun
   * Fetches feeds from the local database and publishes them
   */
  async syncFeedsToGun(): Promise<void> {
    if (!this.config.shareFeedList) {
      throw new Error('Feed list sharing is disabled. Enable it in Gun settings first.');
    }

    if (!this.gun || !this.user) {
      throw new Error('Gun not initialized or user not authenticated');
    }

    try {
      const feeds = await getAllFeeds(false); // Don't include deleted feeds
      const feedsToShare = feeds.map(feed => ({
        id: feed.id!,
        url: feed.url,
        title: feed.title,
        description: feed.description
      }));

      await this.shareFeedList(feedsToShare);
      console.log(`Synced ${feedsToShare.length} feeds to Gun`);
    } catch (error) {
      console.error('Error syncing feeds to Gun:', error);
      throw error;
    }
  }

  private static readonly PROFILE_TIMEOUT_MS = 5000;

  async getUserProfile(pubKey: string): Promise<{ pub: string; name: string }> {
    if (!this.gun) {
      throw new Error('Gun not initialized');
    }

    if (!pubKey) {
      throw new Error('Public key is required');
    }

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      let isResolved = false;

      const handleProfile = (profile: any) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeoutId);
        resolve({
          pub: pubKey,
          name: profile?.name || 'Unknown User'
        });
      };

      this.gun
        .user(pubKey)
        .get('profile')
        .once(handleProfile);

      // Set a timeout - resolve with unknown user rather than rejecting
      // This prevents the UI from breaking when a user hasn't set up their profile
      timeoutId = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;

        if (this.connectionStatus === 'disconnected') {
          reject(new Error('Unable to fetch profile: not connected to relay server'));
        } else {
          // Resolve with unknown user - they may just not have set a profile
          console.warn(`Profile timeout for ${truncatePublicKey(pubKey)}, using default`);
          resolve({
            pub: pubKey,
            name: 'Unknown User'
          });
        }
      }, GunService.PROFILE_TIMEOUT_MS);
    });
  }

  private saveFollowedUsers() {
    localStorage.setItem('gunFollowedUsers', JSON.stringify(Array.from(this.followedUsers)));
    this.followedUsersListeners.forEach(listener => listener(Array.from(this.followedUsers)));
  }

  onFollowedUsersChange(callback: (users: string[]) => void) {
    this.followedUsersListeners.add(callback);
    // Immediately call with current users
    callback(Array.from(this.followedUsers));
    
    // Return cleanup function
    return () => {
      this.followedUsersListeners.delete(callback);
    };
  }

  async followUser(pubKey: string) {
    if (!this.gun) {
      throw new Error('Gun not initialized');
    }

    try {
      // Verify the user exists by trying to get their profile
      const profile = await this.getUserProfile(pubKey);
      if (profile) {
        this.followedUsers.add(pubKey);
        this.saveFollowedUsers();
      }
    } catch (error) {
      throw new Error('Failed to follow user: User not found');
    }
  }

  async unfollowUser(pubKey: string) {
    this.followedUsers.delete(pubKey);
    this.saveFollowedUsers();
  }

  getFollowedUsers(): string[] {
    return Array.from(this.followedUsers);
  }
}

export const gunService = new GunService(); 