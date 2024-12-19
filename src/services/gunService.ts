import Gun from 'gun';
import 'gun/sea';

const SEA = (Gun as any).SEA;

interface GunConfig {
  relayServer: string;
  privateKey: string;
  displayName: string;
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
    displayName: ''
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

  async getSharedItems(userPubKey: string) {
    if (!this.gun) {
      throw new Error('Gun not initialized');
    }

    console.log('Fetching shared items for user:', userPubKey);

    return new Promise((resolve, reject) => {
      const items: any[] = [];
      let timeoutId: NodeJS.Timeout;
      let hasReceivedData = false;

      const handleItem = (item: any, id: string) => {
        if (item) {
          console.log('Received shared item:', { id, item });
          hasReceivedData = true;
          items.push({ ...item, id });
        }
      };

      this.gun
        .user(userPubKey)
        .get('sharedItems')
        .map()
        .on(handleItem);

      // Set a timeout to resolve the promise after collecting items
      timeoutId = setTimeout(() => {
        console.log('Resolving with items:', items);
        if (items.length > 0 || hasReceivedData) {
          resolve(items.sort((a, b) => 
            new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()
          ));
        } else {
          console.log('No items found or timeout reached');
          resolve([]);
        }
      }, 2000); // Increased timeout to ensure we get the data

      // Clean up timeout if promise is rejected
      Promise.race([
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout getting shared items')), 5000)
        )
      ]).catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async getMySharedItems() {
    if (!this.user) {
      throw new Error('User not authenticated');
    }
    return this.getSharedItems(this.user.is.pub);
  }

  async getUserProfile(pubKey: string) {
    if (!this.gun) {
      throw new Error('Gun not initialized');
    }

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      const handleProfile = (profile: any) => {
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

      // Set a timeout to reject if profile is not found
      timeoutId = setTimeout(() => {
        reject(new Error('Timeout getting user profile'));
      }, 5000);
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