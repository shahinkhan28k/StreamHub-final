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
    safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(DEFAULT_SEED_VIDEOS));
    return DEFAULT_SEED_VIDEOS;
  }
  try {
    return JSON.parse(localData);
  } catch (e) {
    return DEFAULT_SEED_VIDEOS;
  }
}

// Synchronize local-only videos to Firestore so they are imported to the cloud
export async function syncLocalOnlyVideosToFirestore(): Promise<number> {
  try {
    const locals = getLocalOnlyVideos();
    if (locals.length === 0) return 0;

    const videosRef = collection(db, 'videos');
    const snapshot = await getDocs(query(videosRef));
    const firebaseIds = new Set(snapshot.docs.map(doc => doc.id));

    let uploadedCount = 0;
    for (const localVideo of locals) {
      if (!firebaseIds.has(localVideo.id)) {
        const docRef = doc(db, 'videos', localVideo.id);
        await setDoc(docRef, localVideo, { merge: true });
        uploadedCount++;
      }
    }
    
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
    if (!snapshot.empty) {
      const firebaseVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
      
      // Merge local-only videos so they are not deleted
      const locals = getLocalOnlyVideos();
      const firebaseIds = new Set(firebaseVideos.map(v => v.id));
      const localOnly = locals.filter(v => !firebaseIds.has(v.id));
      
      const mergedVideos = [...firebaseVideos, ...localOnly];
      
      // Save local copy with merged list
      safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(mergedVideos));
      
      // Upload local-only items to Firestore in the background
      if (localOnly.length > 0) {
        syncLocalOnlyVideosToFirestore().catch(err => console.warn("Background sync error:", err));
      }
      
      return mergedVideos;
    }
  } catch (error) {
    console.warn("Firestore unavailable, falling back to local database:", error);
  }
  return getLocalOnlyVideos();
}

// Get single video
export async function getSingleStoredVideo(id: string): Promise<Video | null> {
  try {
    const docRef = doc(db, 'videos', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Video;
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
    tags: videoData.tags || []
  };

  // Update local storage
  let updatedLocals: Video[];
  if (isNew) {
    updatedLocals = [finalVideo, ...locals];
  } else {
    updatedLocals = locals.map(v => v.id === id ? finalVideo : v);
  }
  safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(updatedLocals));

  // Try updating Firestore in background
  try {
    const docRef = doc(db, 'videos', id);
    await setDoc(docRef, finalVideo, { merge: true });
    console.log("Firestore successfully synchronized.");
  } catch (error) {
    console.warn("Firestore write skipped, stored in local storage:", error);
  }

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
        if (!snapshot.empty) {
          const firebaseVideos = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as Video)
          );
          
          // Merge local-only videos so they are not deleted on state change
          const locals = getLocalOnlyVideos();
          const firebaseIds = new Set(firebaseVideos.map(v => v.id));
          const localOnly = locals.filter(v => !firebaseIds.has(v.id));
          
          const mergedVideos = [...firebaseVideos, ...localOnly];
          
          // Update local cache
          safeLocalStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(mergedVideos));
          
          // Background sync
          if (localOnly.length > 0) {
            syncLocalOnlyVideosToFirestore().catch(err => console.warn("Background sync error:", err));
          }
          
          onUpdate(mergedVideos);
        } else {
          onUpdate(getLocalOnlyVideos());
        }
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
