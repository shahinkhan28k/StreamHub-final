import { collection, getDocs, doc, setDoc, deleteDoc, query, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Video } from '../types';

// Memory storage fallback for iframes with blocked storage access
const memoryStorage: Record<string, string> = {};
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage access blocked by sandbox or browser. Falling back to memory storage.", e);
      return memoryStorage[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage access blocked by sandbox or browser. Saving to memory storage.", e);
      memoryStorage[key] = value;
    }
  }
};

const LOCAL_VIDEOS_KEY = 'novastream_local_videos';

const DEFAULT_SEED_VIDEOS: Video[] = [
  {
    id: 'seed-cyberpunk',
    title: "Neon City - Cyberpunk Atmosphere",
    description: "Explore the neon-lit streets of a futuristic city in this immersive cinematic experience. High definition visuals and ambient soundtrack.",
    thumbnail: "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&auto=format&fit=crop&q=60",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    categoryId: "movies",
    views: 125400,
    adClicks: 420,
    duration: "09:56",
    createdAt: Date.now() - 86400000 * 2,
    featured: true,
    locked: false,
    published: true,
    tags: ["cyberpunk", "cinematic", "scifi"]
  },
  {
    id: 'seed-nature',
    title: "Great Mountain Peaks - 4K Drone Footage",
    description: "Breathtaking views of the world's most beautiful mountain ranges. Shot in 4K resolution with professional drone equipment.",
    thumbnail: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=60",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    categoryId: "tech",
    views: 89000,
    adClicks: 310,
    duration: "10:53",
    createdAt: Date.now() - 86400000 * 5,
    featured: false,
    locked: true,
    published: true,
    tags: ["nature", "drone", "4k"]
  },
  {
    id: 'seed-urban',
    title: "Urban Exploring - Abandoned Factory",
    description: "Join us as we explore a massive abandoned factory from the 1920s. Discover hidden artifacts and historical secrets.",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    categoryId: "gaming",
    views: 45000,
    adClicks: 112,
    duration: "00:15",
    createdAt: Date.now() - 86400000,
    featured: false,
    locked: false,
    published: true,
    tags: ["exploration", "urban", "history"]
  },
  {
    id: 'seed-masterclass',
    title: "Premium Masterclass: Advanced Video Production",
    description: "Unlock professional techniques for high-end video editing and color grading. Available for premium members only.",
    thumbnail: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&auto=format&fit=crop&q=60",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    categoryId: "tech",
    views: 1200,
    adClicks: 95,
    duration: "15:20",
    createdAt: Date.now() - 3600000 * 12,
    featured: false,
    locked: false,
    isPremium: true,
    published: true,
    tags: ["education", "pro", "video"]
  }
];

// Helper to get local videos from storage
function getLocalOnlyVideos(): Video[] {
  const localData = safeLocalStorage.getItem(LOCAL_VIDEOS_KEY);
  if (!localData) {
    const seedWithSync = DEFAULT_SEED_VIDEOS.map(v => ({ ...v, synced: true }));
    safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(seedWithSync));
    return seedWithSync;
  }
  try {
    const parsed = JSON.parse(localData) as Video[];
    // Fallback: If any existing videos lack a synced status, we can treat them as synced by default
    // so we don't accidentally resurrect them if they were actually deleted from Firestore.
    return parsed.map(v => v.synced === undefined ? { ...v, synced: true } : v);
  } catch (e) {
    const seedWithSync = DEFAULT_SEED_VIDEOS.map(v => ({ ...v, synced: true }));
    return seedWithSync;
  }
}

// Synchronize local-only videos to Firestore so they are imported to the cloud
export async function syncLocalOnlyVideosToFirestore(): Promise<number> {
  try {
    const locals = getLocalOnlyVideos();
    const localOnly = locals.filter(v => v.synced === false && !v.id.startsWith('seed-'));
    if (localOnly.length === 0) return 0;

    const videosRef = collection(db, 'videos');
    const snapshot = await getDocs(query(videosRef));
    const firebaseIds = new Set(snapshot.docs.map(doc => doc.id));

    let uploadedCount = 0;
    const updatedLocals = [...locals];
    for (const localVideo of localOnly) {
      if (!firebaseIds.has(localVideo.id)) {
        const docRef = doc(db, 'videos', localVideo.id);
        const { synced, ...uploadData } = localVideo;
        await setDoc(docRef, uploadData, { merge: true });
        uploadedCount++;
      }
      
      const idx = updatedLocals.findIndex(v => v.id === localVideo.id);
      if (idx !== -1) {
        updatedLocals[idx] = { ...updatedLocals[idx], synced: true };
      }
    }
    
    safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(updatedLocals));
    
    if (uploadedCount > 0) {
      console.log(`Successfully synced ${uploadedCount} local-only videos to Firestore.`);
    }
    return uploadedCount;
  } catch (error) {
    console.warn("Failed to sync local-only videos to Firestore:", error);
    return 0;
  }
}

// Get all videos with fail-safe fallback
export async function getStoredVideos(): Promise<Video[]> {
  try {
    const videosRef = collection(db, 'videos');
    const snapshot = await getDocs(query(videosRef));
    const firebaseVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), synced: true } as Video));
    
    const locals = getLocalOnlyVideos();
    const firebaseIds = new Set(firebaseVideos.map(v => v.id));
    
    // Only keep local-only items that have never been synced to Firestore
    const localOnly = locals.filter(v => v.synced === false && !firebaseIds.has(v.id) && !v.id.startsWith('seed-'));
    
    const mergedVideos = [...firebaseVideos, ...localOnly];
    
    safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(mergedVideos));
    
    if (localOnly.length > 0) {
      syncLocalOnlyVideosToFirestore().catch(err => console.warn("Background sync error:", err));
    }
    
    return mergedVideos;
  } catch (error) {
    console.warn("Firestore unavailable, falling back to local database:", error);
    return getLocalOnlyVideos();
  }
}

// Get single video
export async function getSingleStoredVideo(id: string): Promise<Video | null> {
  try {
    const docRef = doc(db, 'videos', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data(), synced: true } as Video;
    }
  } catch (error) {
    console.warn(`Firestore get error for ID ${id}, searching local copy:`, error);
  }
  const locals = getLocalOnlyVideos();
  return locals.find(v => v.id === id) || null;
}

// Save/add/update video
export async function saveStoredVideo(videoData: Partial<Video> & { id?: string }): Promise<Video> {
  const locals = getLocalOnlyVideos();
  const isNew = !videoData.id;
  const id = videoData.id || `video-${Date.now()}`;
  
  const finalVideo: Video = {
    id,
    title: videoData.title || 'Untitled Video',
    description: videoData.description || '',
    thumbnail: videoData.thumbnail || 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800',
    videoUrl: videoData.videoUrl || '',
    videoSourceType: videoData.videoSourceType || 'url',
    embedCode: videoData.embedCode || '',
    categoryId: videoData.categoryId || 'movies',
    subCategoryId: videoData.subCategoryId || '',
    views: videoData.views || 0,
    adClicks: videoData.adClicks || 0,
    duration: videoData.duration || '00:00',
    createdAt: videoData.createdAt || Date.now(),
    featured: !!videoData.featured,
    locked: !!videoData.locked,
    isPremium: videoData.isPremium !== undefined ? !!videoData.isPremium : false,
    published: videoData.published !== undefined ? !!videoData.published : true,
    tags: videoData.tags || [],
    synced: false
  };

  // Try updating Firestore
  let isSynced = false;
  try {
    const docRef = doc(db, 'videos', id);
    const { synced, ...uploadData } = finalVideo;
    await setDoc(docRef, uploadData, { merge: true });
    isSynced = true;
    console.log("Firestore successfully synchronized.");
  } catch (error) {
    console.warn("Firestore write skipped, stored in local storage:", error);
  }

  finalVideo.synced = isSynced;

  let updatedLocals: Video[];
  if (isNew) {
    updatedLocals = [finalVideo, ...locals];
  } else {
    updatedLocals = locals.map(v => v.id === id ? finalVideo : v);
  }
  safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(updatedLocals));

  return finalVideo;
}

// Delete video
export async function deleteStoredVideo(video: Video): Promise<void> {
  // Update local storage
  const locals = getLocalOnlyVideos();
  const updatedLocals = locals.filter(v => v.id !== video.id);
  safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(updatedLocals));

  // Try updating Firestore
  try {
    await deleteDoc(doc(db, 'videos', video.id));
    console.log("Deleted from Firestore.");
  } catch (error) {
    console.warn("Firestore delete skipped, removed from local storage:", error);
  }
}

// Real-time synchronization for videos
export function subscribeStoredVideos(
  onUpdate: (videos: Video[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const videosRef = collection(db, 'videos');
    const unsubscribe = onSnapshot(
      query(videosRef),
      (snapshot) => {
        const firebaseVideos = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data(), synced: true } as Video)
        );
        
        const locals = getLocalOnlyVideos();
        const firebaseIds = new Set(firebaseVideos.map(v => v.id));
        
        const localOnly = locals.filter(v => v.synced === false && !firebaseIds.has(v.id) && !v.id.startsWith('seed-'));
        
        const mergedVideos = [...firebaseVideos, ...localOnly];
        
        safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(mergedVideos));
        
        if (localOnly.length > 0) {
          syncLocalOnlyVideosToFirestore().catch(err => console.warn("Background sync error:", err));
        }
        
        onUpdate(mergedVideos);
      },
      (error) => {
        console.warn("Firestore subscription error, falling back to local database:", error);
        onUpdate(getLocalOnlyVideos());
        if (onError) onError(error);
      }
    );
    return unsubscribe;
  } catch (error) {
    console.warn("Firestore subscription failed to initialize, using local database:", error);
    onUpdate(getLocalOnlyVideos());
    return () => {};
  }
}
