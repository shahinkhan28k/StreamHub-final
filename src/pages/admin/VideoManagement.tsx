import React, { useState, useEffect, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Video } from '../../types';
import { 
  Plus, Edit2, Trash2, Eye, Search, Filter, Play, X, Check, 
  Lock, Unlock, Sparkles, Megaphone, Upload, FileVideo, 
  Image as ImageIcon, RefreshCw, AlertTriangle, CheckCircle, Database, Crown
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getStoredVideos, saveStoredVideo, deleteStoredVideo, subscribeStoredVideos, syncLocalOnlyVideosToFirestore } from '../../lib/videoStore';
import { storeLocalMedia } from '../../lib/indexedDb';
import AdminSidebar from '../../components/AdminSidebar';
import { ChevronLeft } from 'lucide-react';
import Hls from 'hls.js';

// Preset High-Speed CDN Video Templates
const CDN_PRESETS = [
  {
    title: "Elephant's Dream (Sci-Fi CGI Film)",
    description: "Elephant's Dream is a visually stunning, high-concept futuristic Sci-Fi story exploring a giant automated mechanical wonderland filled with mysterious machines.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    thumbnail: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=640",
    categoryId: "movies",
    duration: "10:53",
    tags: "scifi, cgi, cinematic, future"
  },
  {
    title: "Sintel (Fantasy Dragon Adventure)",
    description: "A breathtaking and emotional fantasy tale of Sintel, a young nomadic girl who searches the desolate world to rescue her baby dragon companion.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640",
    categoryId: "movies",
    duration: "14:48",
    tags: "fantasy, adventure, emotional, story"
  },
  {
    title: "Tears of Steel (VFX Cyberpunk)",
    description: "Set in a near-future cyberpunk Amsterdam, Tears of Steel features high-tech hologram systems, flying giant robot controllers, and elite lasers.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    thumbnail: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=640",
    categoryId: "tech",
    duration: "12:14",
    tags: "cyberpunk, scifi, action, vfx"
  },
  {
    title: "Big Buck Bunny (Comedy Animation)",
    description: "A lighthearted and funny forest adventure where a giant fluffy rabbit plans comic revenge on mischievous woodland pests.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    thumbnail: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=640",
    categoryId: "gaming",
    duration: "09:56",
    tags: "comedy, family, fun, cartoon"
  }
];

// Preprocess URLs to ensure standard cloud drives return direct media streaming streams or clean embed src
function preprocessVideoUrl(url: string): string {
  if (!url) return '';
  let trimmed = url.trim();

  // If user pasted an iframe string, extract the src URL first!
  if (trimmed.toLowerCase().includes('<iframe')) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      trimmed = srcMatch[1];
    }
  }

  // Dropbox share links: convert to raw direct media streams
  if (trimmed.toLowerCase().includes('dropbox.com')) {
    if (trimmed.includes('?dl=')) {
      trimmed = trimmed.replace(/\?dl=[01]/, '?raw=1');
    } else if (trimmed.includes('&dl=')) {
      trimmed = trimmed.replace(/&dl=[01]/, '&raw=1');
    } else if (!trimmed.includes('?')) {
      trimmed = trimmed + '?raw=1';
    }
  }

  // Google Drive share links: convert to direct streamable UC url
  if (trimmed.toLowerCase().includes('drive.google.com/file/d/')) {
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      trimmed = `https://docs.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  // XNXX and XVideos Links Support: convert to direct embedframe
  if (trimmed.toLowerCase().includes('xnxx.com') || trimmed.toLowerCase().includes('xvideos.com')) {
    const domain = trimmed.toLowerCase().includes('xnxx.com') ? 'xnxx.com' : 'xvideos.com';
    if (!trimmed.includes('/embedframe/')) {
      const adultMatch = trimmed.match(/video-([a-zA-Z0-9]+)/i);
      if (adultMatch && adultMatch[1]) {
        trimmed = `https://www.${domain}/embedframe/${adultMatch[1]}`;
      }
    }
  }

  return trimmed;
}

export default function VideoManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ [key: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [siteSettings, setSiteSettings] = useState<any>(null);

  const getSlugFromLink = (link: string, fallbackLabel: string): string => {
    if (!link || link === '/' || link === '#') {
      return fallbackLabel.toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-');
    }
    if (link.startsWith('/category/')) {
      const parts = link.replace('/category/', '').split('/');
      return (parts[0] || '').toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-') || fallbackLabel.toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-');
    }
    return link.toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-');
  };

  const getSubSlugFromLink = (link: string, fallbackLabel: string): string => {
    if (link.startsWith('/category/')) {
      const parts = link.replace('/category/', '').split('/');
      if (parts.length > 1) {
        return parts[1].toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-');
      }
    }
    return fallbackLabel.toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-');
  };

  const getCategoriesFromMenu = () => {
    const menu = siteSettings?.navigationMenu || [
      { id: '1', label: 'Home', link: '/' },
      { id: '2', label: 'Movies', link: '/category/movies' },
      { id: '3', label: 'Sports', link: '/category/sports' },
      { id: '4', label: 'Gaming', link: '/category/gaming' }
    ];

    return menu
      .filter((item: any) => item.link !== '/' && item.link !== '#')
      .map((item: any) => {
        const slug = getSlugFromLink(item.link, item.label);
        const subMenus = (item.subMenus || []).map((sub: any) => ({
          label: sub.label,
          slug: getSubSlugFromLink(sub.link, sub.label),
          link: sub.link
        }));

        return {
          id: slug,
          label: item.label,
          subMenus
        };
      });
  };
  
  const { register, handleSubmit, reset, setValue, watch } = useForm<any>({
    defaultValues: {
      title: '',
      description: '',
      videoUrl: '',
      videoSourceType: 'url',
      embedCode: '',
      thumbnail: '',
      categoryId: 'movies',
      subCategoryId: '',
      duration: '',
      tags: '',
      published: true,
      featured: false,
      locked: false,
      isPremium: false,
      uploadStorageType: 'server'
    }
  });

  const videoFileRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const videoSourceType = watch('videoSourceType') || 'url';
  const uploadStorageType = watch('uploadStorageType') || 'server';
  const watchedCategoryId = watch('categoryId');
  const currentCategoryObj = getCategoriesFromMenu().find((c: any) => c.id === watchedCategoryId);
  const hasSubmenus = currentCategoryObj && currentCategoryObj.subMenus && currentCategoryObj.subMenus.length > 0;

  const watchedVideoUrl = watch('videoUrl');

  const [autoThumbnailBlob, setAutoThumbnailBlob] = useState<Blob | null>(null);
  const [autoThumbnailPreview, setAutoThumbnailPreview] = useState<string>('');
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);

  const clearAutoThumbnail = () => {
    if (autoThumbnailPreview) {
      URL.revokeObjectURL(autoThumbnailPreview);
    }
    setAutoThumbnailBlob(null);
    setAutoThumbnailPreview('');
    setIsGeneratingThumbnail(false);
  };

  const detectVideoDurationAndThumbnail = (fileOrUrl: File | string) => {
    setIsGeneratingThumbnail(true);
    
    let urlToLoad = '';
    if (typeof fileOrUrl !== 'string') {
      urlToLoad = URL.createObjectURL(fileOrUrl);
    } else {
      urlToLoad = preprocessVideoUrl(fileOrUrl);
    }

    if (!urlToLoad) {
      setIsGeneratingThumbnail(false);
      return;
    }

    const videoElement = document.createElement('video');
    
    // To ensure full cross-browser loading capability (including iOS and Safari constraints),
    // we attach the element off-screen to the DOM and force a load cycle.
    videoElement.style.position = 'fixed';
    videoElement.style.left = '-9999px';
    videoElement.style.top = '-9999px';
    videoElement.style.width = '320px';
    videoElement.style.height = '180px';
    videoElement.style.visibility = 'hidden';
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('webkit-playsinline', 'true');
    videoElement.crossOrigin = 'anonymous';
    videoElement.preload = 'auto';

    document.body.appendChild(videoElement);

    let hls: any = null;

    // Safety timeout of 5 seconds to prevent infinite loading state
    const safetyTimeout = setTimeout(() => {
      console.warn("Video thumbnail/duration generation timed out.");
      setIsGeneratingThumbnail(false);
      cleanup();
    }, 5000);

    const cleanup = () => {
      clearTimeout(safetyTimeout);
      try {
        if (videoElement.parentNode) {
          document.body.removeChild(videoElement);
        }
      } catch (domErr) {
        // Safe catch if already removed
      }
      if (hls) {
        hls.destroy();
      }
    };

    const setFormattedDuration = (dur: number) => {
      if (dur && isFinite(dur)) {
        const hrs = Math.floor(dur / 3600);
        const mins = Math.floor((dur % 3600) / 60);
        const secs = Math.floor(dur % 60);
        
        let formatted = '';
        if (hrs > 0) {
          formatted = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
          formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        setValue('duration', formatted);
      }
    };

    videoElement.onloadedmetadata = () => {
      setFormattedDuration(videoElement.duration);
      // Seek to an interesting frame: 3 seconds or 10% of video
      const seekTime = Math.min(3, videoElement.duration / 2 || 1);
      videoElement.currentTime = seekTime;
    };

    videoElement.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth || 640;
        canvas.height = videoElement.videoHeight || 360;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob) {
              setAutoThumbnailBlob(blob);
              const previewUrl = URL.createObjectURL(blob);
              setAutoThumbnailPreview(previewUrl);
              setValue('thumbnail', '(Auto-generated from Video)');
            }
            setIsGeneratingThumbnail(false);
            cleanup();
          }, 'image/jpeg', 0.85);
        } else {
          setIsGeneratingThumbnail(false);
          cleanup();
        }
      } catch (err) {
        console.warn("Canvas capture failed:", err);
        setIsGeneratingThumbnail(false);
        cleanup();
      }
    };

    videoElement.onerror = () => {
      console.warn("Video element failed to load source:", urlToLoad);
      setIsGeneratingThumbnail(false);
      cleanup();
    };

    const isM3U8 = urlToLoad.toLowerCase().includes('.m3u8');
    if (isM3U8 && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(urlToLoad);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setTimeout(() => {
          if (videoElement.duration && isFinite(videoElement.duration)) {
            setFormattedDuration(videoElement.duration);
          }
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((blob) => {
                if (blob) {
                  setAutoThumbnailBlob(blob);
                  const previewUrl = URL.createObjectURL(blob);
                  setAutoThumbnailPreview(previewUrl);
                  setValue('thumbnail', '(Auto-generated from Video)');
                }
                setIsGeneratingThumbnail(false);
                cleanup();
              }, 'image/jpeg', 0.85);
            } else {
              setIsGeneratingThumbnail(false);
              cleanup();
            }
          } catch (hlsErr) {
            setIsGeneratingThumbnail(false);
            cleanup();
          }
        }, 1500);
      });
    } else {
      videoElement.src = urlToLoad;
      videoElement.load();
    }
  };

  useEffect(() => {
    if (watchedVideoUrl && (watchedVideoUrl.startsWith('http://') || watchedVideoUrl.startsWith('https://')) && watchedVideoUrl !== 'embed') {
      // Don't auto-generate if we are editing and the videoUrl is unchanged from the original
      if (editingVideo && watchedVideoUrl === editingVideo.videoUrl) {
        return;
      }
      const timer = setTimeout(() => {
        detectVideoDurationAndThumbnail(watchedVideoUrl);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [watchedVideoUrl, editingVideo]);

  useEffect(() => {
    if (!isModalOpen) {
      clearAutoThumbnail();
    }
  }, [isModalOpen]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upload') === 'true') {
      setEditingVideo(null);
      setIsModalOpen(true);
      navigate('/admin/videos', { replace: true });
    }
  }, [location.search, navigate]);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const data = await getStoredVideos();
      setVideos(data);
    } catch (error) {
      console.error("Error loading videos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeStoredVideos((data) => {
      setVideos(data);
      setLoading(false);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSiteSettings(docSnap.data());
      }
    });

    return () => {
      unsubscribe();
      unsubSettings();
    };
  }, []);

  const fileToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Create an image element
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      img.onload = () => {
        // Clean up object URL
        URL.revokeObjectURL(objectUrl);

        // Max target width / height for thumbnail
        const MAX_WIDTH = 640;
        const MAX_HEIGHT = 360; // 16:9 ratio target
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions preserving ratio
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }

        // Setup canvas for downscaling
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Export as compressed JPEG (0.7 quality is extremely lightweight, around 20-40KB, and looks pristine)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        } else {
          // Fallback to simple FileReader if canvas context is unavailable
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        }
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        // Fallback to standard Base64 FileReader on load error
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      };
    });
  };

  const uploadFile = async (file: File | Blob, path: string, fileName?: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const name = fileName || (file as File).name || `auto_thumbnail_${Date.now()}.jpg`;
      const storageRef = ref(storage, `${path}/${Date.now()}_${name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      // Add a watchdog timer (e.g. 120 seconds) to prevent infinite hanging at 0%
      let lastBytesTransferred = 0;
      let lastProgressTime = Date.now();

      const watchdogInterval = setInterval(() => {
        const now = Date.now();
        // If 120 seconds have passed without any bytes transferred, cancel the task and reject
        if (now - lastProgressTime > 120000 && lastBytesTransferred === 0) {
          clearInterval(watchdogInterval);
          try {
            uploadTask.cancel();
          } catch (cancelErr) {
            console.error("Failed to cancel upload task:", cancelErr);
          }
          reject(new Error("STORAGE_VIDEO_FAILED: TIMEOUT - Upload is stuck at 0%. This usually means Firebase Storage is not enabled in your Firebase Console, or the bucket rules block uploads."));
        }
      }, 2000);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const bytes = snapshot.bytesTransferred;
          if (bytes > lastBytesTransferred) {
            lastBytesTransferred = bytes;
            lastProgressTime = Date.now();
          }
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress((prev) => ({ ...prev, [path]: Math.round(p) }));
        },
        (error) => {
          clearInterval(watchdogInterval);
          console.error(`Upload error for ${path}:`, error);
          reject(error);
        },
        async () => {
          clearInterval(watchdogInterval);
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (urlErr) {
            reject(urlErr);
          }
        }
      );
    });
  };

  const uploadToPixeldrain = async (file: File | Blob, pathKey: 'videos' | 'thumbnails' = 'videos'): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('anonymous', 'true');

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setProgress((prev) => ({ ...prev, [pathKey]: Math.round(percentComplete) }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.id) {
              resolve(`https://pixeldrain.com/api/file/${response.id}`);
            } else {
              reject(new Error(response.message || "Pixeldrain upload failed."));
            }
          } catch (e) {
            reject(new Error("Failed to parse Pixeldrain response."));
          }
        } else {
          reject(new Error(`Pixeldrain server returned status ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error("Network error during Pixeldrain upload. Please check connection."));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error("Upload aborted."));
      });

      xhr.open('POST', 'https://pixeldrain.com/api/file');
      xhr.send(formData);
    });
  };

  const uploadToServer = async (file: File | Blob, pathKey: 'videos' | 'thumbnails' = 'videos'): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setProgress((prev) => ({ ...prev, [pathKey]: Math.round(percentComplete) }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.url) {
              resolve(response.url);
            } else {
              reject(new Error(response.error || "Server upload failed."));
            }
          } catch (e) {
            reject(new Error("Failed to parse server response."));
          }
        } else {
          reject(new Error(`Server returned status ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error("Network error during server upload. Please check connection."));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error("Upload aborted."));
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  };

  const handleApplyPreset = (preset: typeof CDN_PRESETS[0]) => {
    setValue('title', preset.title);
    setValue('description', preset.description);
    setValue('videoUrl', preset.videoUrl);
    setValue('thumbnail', preset.thumbnail);
    setValue('categoryId', preset.categoryId);
    setValue('duration', preset.duration);
    setValue('tags', preset.tags);
  };

  const handleForceCloudSync = async () => {
    setSyncing(true);
    try {
      // First sync any local-only videos to Firestore
      const syncedCount = await syncLocalOnlyVideosToFirestore();
      
      // Re-trigger global video fetch which pulls from Firestore & saves back to local storage
      const refreshedData = await getStoredVideos();
      setVideos(refreshedData);
      
      if (syncedCount > 0) {
        alert(`ডাটাবেজ সফলভাবে সিঙ্ক করা হয়েছে!\n\n✅ ${syncedCount} টি লোকাল ভিডিও ফায়ারবেস ক্লাউড ডাটাবেজে সফলভাবে আপলোড করা হয়েছে।\n✅ ক্লাউডের সব ভিডিও এখন এই ওয়েবসাইটে লাইভ রয়েছে।`);
      } else {
        alert("ডাটাবেজ সফলভাবে সিঙ্ক করা হয়েছে! লোকাল এবং ক্লাউডের সকল ভিডিও ইতিমধ্যে সিঙ্ক অবস্থায় রয়েছে।");
      }
    } catch (e) {
      console.error(e);
      alert("Sync completed with warnings. Running in optimized standalone local mode.");
    } finally {
      setSyncing(false);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      setUploading(true);
      const videoSourceType = data.videoSourceType || 'url';
      let videoUrl = data.videoUrl;
      let embedCode = data.embedCode || '';
      let thumbnailUrl = data.thumbnail;

      if (videoSourceType === 'embed') {
        if (!embedCode) {
          alert("Please enter the HTML Embed Code");
          setUploading(false);
          return;
        }
        // Extract src for fallback videoUrl if iframe is pasted
        if (embedCode.toLowerCase().includes('<iframe')) {
          const srcMatch = embedCode.match(/src=["']([^"']+)["']/i);
          if (srcMatch && srcMatch[1]) {
            videoUrl = srcMatch[1];
          }
        }
        if (!videoUrl) {
          videoUrl = 'embed';
        }
      } else {
        // Handle Video File Upload
        const videoFile = videoFileRef.current?.files?.[0];
        if (videoFile) {
          if (data.uploadStorageType === 'server') {
            try {
              videoUrl = await uploadToServer(videoFile, 'videos');
            } catch (srvErr: any) {
              console.warn("Server upload failed. Falling back to local IndexedDB.", srvErr);
              try {
                const fileKey = `video-${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                videoUrl = await storeLocalMedia(fileKey, videoFile);
                alert(
                  "ℹ️ হোস্টিং সার্ভার স্টোরেজে আপলোড ব্যর্থ হওয়ায় ভিডিওটি আপনার ব্রাউজারের লোকাল স্টোরেজে (IndexedDB) সেভ করা হয়েছে!\n\n" +
                  "⚠️ সতর্কবার্তা: এটি শুধুমাত্র আপনার নিজের ফোনে প্লে হবে। অন্য ডিভাইস থেকে দেখতে চাইলে আবার চেষ্টা করুন।"
                );
              } catch (idbErr) {
                console.error("Local IndexedDB store failed:", idbErr);
                throw new Error(`STORAGE_VIDEO_FAILED: Server upload and local IndexedDB backup both failed: ${srvErr?.message || ''}`);
              }
            }
          } else if (data.uploadStorageType === 'pixeldrain') {
            try {
              videoUrl = await uploadToPixeldrain(videoFile, 'videos');
            } catch (pdErr: any) {
              console.warn("Pixeldrain upload failed. Falling back to local IndexedDB.", pdErr);
              try {
                const fileKey = `video-${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                videoUrl = await storeLocalMedia(fileKey, videoFile);
                alert(
                  "ℹ️ Pixeldrain ক্লাউড আপলোড ব্যর্থ হওয়ায় ভিডিওটি আপনার ব্রাউজারের লোকাল স্টোরেজে (IndexedDB) সেভ করা হয়েছে!\n\n" +
                  "⚠️ সতর্কবার্তা: এটি শুধুমাত্র আপনার নিজের ফোনে প্লে হবে। অন্য ডিভাইস থেকে দেখতে চাইলে ডিরেক্ট লিংক দিন বা আবার চেষ্টা করুন।"
                );
              } catch (idbErr) {
                console.error("Local IndexedDB store failed:", idbErr);
                throw new Error(`STORAGE_VIDEO_FAILED: Pixeldrain upload and local IndexedDB backup both failed: ${pdErr?.message || ''}`);
              }
            }
          } else if (data.uploadStorageType === 'firebase') {
            try {
              videoUrl = await uploadFile(videoFile, 'videos');
            } catch (uploadErr: any) {
              console.warn("Firebase Storage upload blocked or failed for video. Falling back to local IndexedDB.", uploadErr);
              try {
                const fileKey = `video-${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                videoUrl = await storeLocalMedia(fileKey, videoFile);
                alert(
                  "ℹ️ ফায়ারবেস স্টোরেজ ব্লক বা নিষ্ক্রিয় থাকায় ভিডিও ফাইলটি আপনার ব্রাউজারের লোকাল স্টোরেজে (IndexedDB) সফলভাবে সেভ করা হয়েছে!\n\n" +
                  "⚠️ সতর্কবার্তা: এটি আপনার নিজস্ব ব্রাউজারে সুন্দরভাবে চলবে। তবে অন্যান্য ভিজিটররা এই ভিডিওটি দেখতে পারবে না, কারণ ফাইলটি তাদের ব্রাউজারে নেই। সাধারণ ভিজিটরদের দেখার জন্য দয়া করে Hosting Server Storage বা Pixeldrain সিলেক্ট করুন!"
                );
              } catch (idbErr) {
                console.error("Local IndexedDB store failed:", idbErr);
                throw new Error(`STORAGE_VIDEO_FAILED: ${uploadErr?.message || 'Access Denied'}`);
              }
            }
          } else {
            // Direct Local IndexedDB save
            try {
              const fileKey = `video-${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
              videoUrl = await storeLocalMedia(fileKey, videoFile);
            } catch (idbErr: any) {
              console.error("Local IndexedDB store failed:", idbErr);
              throw new Error(`STORAGE_VIDEO_FAILED: Local IndexedDB storage full or unsupported: ${idbErr?.message || ''}`);
            }
          }
        }

        if (!videoUrl) {
          alert("Please specify a Video (either enter direct URL or select file to upload)");
          setUploading(false);
          return;
        }
      }

      // Handle Thumbnail File Upload
      const thumbFile = thumbFileRef.current?.files?.[0];
      if (thumbFile) {
        if (data.uploadStorageType === 'server') {
          try {
            thumbnailUrl = await uploadToServer(thumbFile, 'thumbnails');
          } catch (uploadErr: any) {
            console.warn("Server upload blocked or failed for thumbnail. Falling back to local Base64/DataURL.", uploadErr);
            try {
              thumbnailUrl = await fileToBase64(thumbFile);
            } catch (b64Err) {
              console.error("Base64 conversion failed", b64Err);
              throw new Error(`STORAGE_THUMBNAIL_FAILED: ${uploadErr?.message || 'Access Denied'}`);
            }
          }
        } else if (data.uploadStorageType === 'firebase') {
          try {
            thumbnailUrl = await uploadFile(thumbFile, 'thumbnails');
          } catch (uploadErr: any) {
            console.warn("Firebase Storage upload blocked or failed for thumbnail. Falling back to local Base64/DataURL.", uploadErr);
            try {
              thumbnailUrl = await fileToBase64(thumbFile);
            } catch (b64Err) {
              console.error("Base64 conversion failed", b64Err);
              throw new Error(`STORAGE_THUMBNAIL_FAILED: ${uploadErr?.message || 'Access Denied'}`);
            }
          }
        } else if (data.uploadStorageType === 'pixeldrain') {
          try {
            thumbnailUrl = await uploadToPixeldrain(thumbFile, 'thumbnails');
          } catch (uploadErr: any) {
            console.warn("Pixeldrain upload blocked or failed for thumbnail. Falling back to local Base64/DataURL.", uploadErr);
            try {
              thumbnailUrl = await fileToBase64(thumbFile);
            } catch (b64Err) {
              console.error("Base64 conversion failed", b64Err);
              throw new Error(`STORAGE_THUMBNAIL_FAILED: ${uploadErr?.message || 'Access Denied'}`);
            }
          }
        } else {
          // Direct local Base64/DataURL
          try {
            thumbnailUrl = await fileToBase64(thumbFile);
          } catch (b64Err: any) {
            console.error("Base64 conversion failed", b64Err);
            throw new Error(`STORAGE_THUMBNAIL_FAILED: Local processing failed: ${b64Err?.message || ''}`);
          }
        }
      } else if ((!thumbnailUrl || thumbnailUrl === '(Auto-generated from Video)') && autoThumbnailBlob) {
        if (data.uploadStorageType === 'server') {
          try {
            thumbnailUrl = await uploadToServer(autoThumbnailBlob, 'thumbnails');
          } catch (uploadErr: any) {
            console.warn("Server upload blocked or failed for auto thumbnail. Falling back to local Base64/DataURL.", uploadErr);
            try {
              thumbnailUrl = await fileToBase64(autoThumbnailBlob);
            } catch (b64Err) {
              console.error("Base64 conversion failed for auto-thumbnail", b64Err);
            }
          }
        } else if (data.uploadStorageType === 'firebase') {
          try {
            thumbnailUrl = await uploadFile(autoThumbnailBlob, 'thumbnails', 'auto_thumbnail.jpg');
          } catch (uploadErr: any) {
            console.warn("Firebase Storage upload blocked or failed for auto thumbnail. Falling back to local Base64/DataURL.", uploadErr);
            try {
              thumbnailUrl = await fileToBase64(autoThumbnailBlob);
            } catch (b64Err) {
              console.error("Base64 conversion failed for auto-thumbnail", b64Err);
            }
          }
        } else if (data.uploadStorageType === 'pixeldrain') {
          try {
            thumbnailUrl = await uploadToPixeldrain(autoThumbnailBlob, 'thumbnails');
          } catch (uploadErr: any) {
            console.warn("Pixeldrain upload blocked or failed for auto thumbnail. Falling back to local Base64/DataURL.", uploadErr);
            try {
              thumbnailUrl = await fileToBase64(autoThumbnailBlob);
            } catch (b64Err) {
              console.error("Base64 conversion failed for auto-thumbnail", b64Err);
            }
          }
        } else {
          // Direct local Base64/DataURL for auto-thumbnail
          try {
            thumbnailUrl = await fileToBase64(autoThumbnailBlob);
          } catch (b64Err) {
            console.error("Base64 conversion failed for auto-thumbnail", b64Err);
          }
        }
      }

      // If no thumbnail is specified or uploaded, use a premium cinema fallback placeholder
      if (!thumbnailUrl || thumbnailUrl === '(Auto-generated from Video)') {
        thumbnailUrl = "https://images.unsplash.com/photo-1574375927938-d5a98e8edd86?q=80&w=800";
      }

      const finalVideo: Partial<Video> = {
        title: data.title,
        description: data.description,
        videoUrl,
        videoSourceType,
        embedCode,
        thumbnail: thumbnailUrl,
        categoryId: data.categoryId,
        subCategoryId: data.subCategoryId || '',
        duration: data.duration || "00:00",
        tags: typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : data.tags || [],
        featured: !!data.featured,
        locked: !!data.locked,
        published: !!data.published,
        isPremium: !!data.isPremium,
        views: editingVideo ? editingVideo.views : 0,
        adClicks: editingVideo ? editingVideo.adClicks : 0,
        createdAt: editingVideo ? editingVideo.createdAt : Date.now(),
      };

      if (editingVideo) {
        finalVideo.id = editingVideo.id;
      }

      await saveStoredVideo(finalVideo);
      
      setIsModalOpen(false);
      setEditingVideo(null);
      setProgress({});
      reset();
      fetchVideos();
    } catch (error: any) {
      console.error("Error saving video:", error);
      const errMsg = error?.message || "";
      
      if (errMsg.includes("STORAGE_VIDEO_FAILED") || errMsg.includes("STORAGE_THUMBNAIL_FAILED")) {
        alert(
          "❌ ফায়ারবেস স্টোরেজ আপলোড ব্যর্থ হয়েছে! (Firebase Storage Upload Failed)\n\n" +
          "এই সমস্যাটি হওয়ার প্রধান কারণ আপনার ফায়ারবেস কনসোলে 'Firebase Storage' এখনো এক্টিভেট করা হয়নি, অথবা এর সিকিউরিটি রুলস (Security Rules) ফাইল আপলোড করা ব্লক করে রেখেছে।\n\n" +
          "✅ স্থায়ীভাবে সমাধান করার সহজ উপায়:\n" +
          "১. ফায়ারবেস কনসোলে যান: console.firebase.google.com\n" +
          "২. বাম পাশের মেনুতে 'Build' এর অধীনে 'Storage' এ ক্লিক করুন।\n" +
          "৩. 'Get Started' এ ক্লিক করে স্টোরেজ বাকেটটি চালু করুন।\n" +
          "৪. 'Rules' ট্যাবে গিয়ে 'allow read, write: if false;' পরিবর্তন করে 'allow read, write: if true;' (অথবা custom auth) সেট করুন এবং Publish করুন।\n\n" +
          "💡 তাত্ক্ষণিক সমাধান (সবচেয়ে বেশি রেকমেন্ডেড):\n" +
          "ভিডিও ফাইল সরাসরি আপলোড না করে, যেকোনো ভিডিওর সরাসরি লিংক (যেমন Google Drive, Dropbox, free CDNs, বা YouTube Link) কপি করে 'Video URL' বক্সে পেস্ট করুন! এটি কোনো আপলোড টাইম ছাড়াই তাৎক্ষণিকভাবে মাত্র ১ সেকেন্ডে যুক্ত হয়ে যাবে!"
        );
      } else {
        alert("Error saving video: " + errMsg);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (video: Video) => {
    if (window.confirm('Are you sure you want to delete this video? This will also remove any uploaded storage files.')) {
      try {
        await deleteStoredVideo(video);

        // Attempt to delete from Firebase Storage if matching paths
        const deleteFromStorage = async (url: string) => {
          if (url.includes('firebasestorage.googleapis.com')) {
            try {
              const fileRef = ref(storage, url);
              await deleteObject(fileRef);
            } catch (e) {
              console.warn("Storage item cleanup skipped:", url);
            }
          }
        };

        await deleteFromStorage(video.videoUrl);
        await deleteFromStorage(video.thumbnail);

        fetchVideos();
      } catch (error) {
        console.error("Error deleting video:", error);
        fetchVideos();
      }
    }
  };

  const openEdit = (video: Video) => {
    setEditingVideo(video);
    setValue('title', video.title);
    setValue('description', video.description);
    setValue('thumbnail', video.thumbnail);
    setValue('videoUrl', video.videoUrl);
    setValue('videoSourceType', video.videoSourceType || 'url');
    setValue('embedCode', video.embedCode || '');
    setValue('categoryId', video.categoryId);
    setValue('subCategoryId', video.subCategoryId || '');
    setValue('duration', video.duration);
    setValue('tags', video.tags?.join(', ') || '');
    setValue('featured', video.featured);
    setValue('locked', video.locked);
    setValue('published', video.published);
    setValue('isPremium', !!video.isPremium);
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingVideo(null);
    reset({
      title: '',
      description: '',
      videoUrl: '',
      videoSourceType: 'url',
      embedCode: '',
      thumbnail: '',
      categoryId: 'movies',
      subCategoryId: '',
      duration: '',
      tags: '',
      featured: false,
      locked: false,
      isPremium: false,
      published: true
    });
    setIsModalOpen(true);
  };

  // Filter & Search Logic
  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          video.categoryId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || video.categoryId === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || 
                          (selectedStatus === 'locked' && video.locked) || 
                          (selectedStatus === 'unlocked' && !video.locked) ||
                          (selectedStatus === 'featured' && video.featured);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Elegant Sidebar */}
        <AdminSidebar />

        {/* Content Area */}
        <div className="flex-1 w-full space-y-6">
          {/* Back Button */}
          <div className="flex items-center">
            <button 
              type="button"
              onClick={() => isModalOpen ? setIsModalOpen(false) : navigate(-1)} 
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-full text-xs font-bold text-neutral-300 hover:text-white transition-all shadow-xl"
            >
              <ChevronLeft className="w-4 h-4 text-rose-500" />
              <span>{isModalOpen ? 'তালিকায় ফিরে যান (Back to List)' : 'ফিরে যান (Go Back)'}</span>
            </button>
          </div>

          {!isModalOpen ? (
            <>
              {/* Top Title & Quick Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-neutral-900/40 p-6 rounded-3xl border border-white/5">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            Video Management Hub
          </h1>
          <p className="text-neutral-400 text-sm">Upload, customize, and orchestrate high-speed streaming assets</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleForceCloudSync}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-3 bg-neutral-900 border border-white/5 hover:border-white/10 rounded-full font-bold text-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-500 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Force Sync Cloud'}
          </button>

          <button 
            onClick={openAdd}
            className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 rounded-full font-bold text-sm transition-all shadow-xl shadow-rose-600/20"
          >
            <Plus className="w-5 h-5" /> Add Video
          </button>
        </div>
      </div>

      {/* Connection & System Status Indicator */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gradient-to-r from-rose-950/20 to-neutral-900/40 p-5 rounded-2xl border border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Database Status</h4>
            <p className="text-sm font-black text-white flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active / Standalone Enabled
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Storage Sync Engine</h4>
            <p className="text-sm font-black text-white mt-0.5">Automatic Fallback Active</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-500">
            <Play className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Stored Assets</h4>
            <p className="text-sm font-black text-white mt-0.5">{videos.length} videos active</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center gap-4 p-4 bg-neutral-900 border border-white/5 rounded-2xl">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input 
            type="text" 
            placeholder="Search by title, tags, or categories..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-800 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-neutral-800 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-rose-500 transition-colors cursor-pointer text-neutral-300"
          >
            <option value="all">All Categories</option>
            {getCategoriesFromMenu().map((cat: any) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>

          <select 
            value={selectedStatus} 
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-neutral-800 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-rose-500 transition-colors cursor-pointer text-neutral-300"
          >
            <option value="all">All States</option>
            <option value="locked">Locked Only</option>
            <option value="unlocked">Free Only</option>
            <option value="featured">Featured Only</option>
          </select>
        </div>
      </div>

      {/* Videos Table */}
      <div className="bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-neutral-950/40">
                <th className="px-6 py-4">Video Details</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Engagement</th>
                <th className="px-6 py-4">Ad Clicks</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredVideos.map((video) => (
                <tr key={video.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-24 aspect-video rounded-lg bg-neutral-800 overflow-hidden relative border border-white/5 flex-shrink-0">
                        <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                        {video.locked && (
                          <div className="absolute top-1 right-1 bg-amber-500/90 backdrop-blur-sm p-1 rounded-md">
                            <Lock className="w-3 h-3 text-neutral-950" />
                          </div>
                        )}
                        {video.isPremium && (
                          <div className="absolute top-1 left-1 bg-purple-600/90 backdrop-blur-sm p-1 rounded-md">
                            <Crown className="w-3 h-3 text-white fill-current" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/70 text-[9px] px-1 rounded font-mono text-neutral-300">
                          {video.duration}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-white line-clamp-1 group-hover:text-rose-500 transition-colors">{video.title}</h4>
                        <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{video.description}</p>
                        {video.videoUrl?.startsWith('indexeddb://') && (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              ⚠️ লোকাল ফাইল (অন্য ডিভাইসে চলবে না)
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto whitespace-nowrap">
                          {video.tags?.slice(0, 3).map((tag, i) => (
                            <span key={i} className="text-[9px] font-medium px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded-full border border-white/5">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5 items-start">
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full">
                        {video.categoryId}
                      </span>
                      {video.subCategoryId && (
                        <span className="text-[10px] font-medium text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-full border border-white/5">
                          {video.subCategoryId}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1 ${video.published ? 'text-emerald-500' : 'text-neutral-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${video.published ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-500'}`} />
                        {video.published ? 'Published' : 'Draft'}
                      </span>
                      {video.featured && (
                        <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">★ Featured</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-bold text-white">{(video.views || 0).toLocaleString()}</div>
                    <div className="text-[10px] text-neutral-500">Total Views</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono font-bold text-amber-500">{(video.adClicks || 0).toLocaleString()}</div>
                    <div className="text-[10px] text-neutral-500">Clicks Tracked</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => openEdit(video)}
                        className="p-2 bg-neutral-800 hover:bg-rose-500/10 hover:text-rose-500 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(video)}
                        className="p-2 bg-neutral-800 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link 
                        to={`/video/${video.id}`}
                        className="p-2 bg-neutral-800 hover:bg-blue-500/10 hover:text-blue-500 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredVideos.length === 0 && !loading && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-neutral-600">
              <Play className="w-8 h-8" />
            </div>
            <p className="text-neutral-400">No matching videos found. Click &quot;Add Video&quot; to populate your streaming list.</p>
          </div>
        )}
      </div>
      </>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-white/5 rounded-3xl w-full shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-neutral-900 z-10">
              <div>
                <h2 className="text-xl font-bold">{editingVideo ? 'Modify Streaming Asset' : 'Add New Streaming Asset'}</h2>
                <p className="text-neutral-400 text-xs">Fill details or choose one of our high-speed preset templates</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              
              {/* Instant High-Speed Presets Panel */}
              {!editingVideo && (
                <div className="bg-gradient-to-r from-rose-950/30 to-blue-950/20 p-5 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex items-center gap-2 text-rose-500 text-xs font-bold uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 animate-pulse" /> Speed Optimization presets
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Avoid upload waiting times! Click on any preset movie below to instantly fill the fields with working 4K CDN high-speed video URLs:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {CDN_PRESETS.map((preset, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleApplyPreset(preset)}
                        className="flex items-center justify-between px-3 py-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-white/5 text-left text-[11px] transition-all font-semibold"
                      >
                        <span className="truncate">{preset.title}</span>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 opacity-60 ml-1 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Video Title</label>
                  <input {...register('title', { required: true })} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-rose-500 transition-colors text-sm" placeholder="Enter video title" />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Description</label>
                  <textarea {...register('description')} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-rose-500 transition-colors h-24 text-sm" placeholder="Describe your video" />
                </div>

                <div className="space-y-2 md:col-span-2 bg-neutral-950/40 p-4 rounded-2xl border border-white/5">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest block mb-3">ভিডিও যোগ করার পদ্ধতি (Video Addition Method)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold uppercase cursor-pointer transition-all ${videoSourceType === 'url' ? 'bg-rose-600/10 border-rose-500 text-white' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:text-neutral-200'}`}>
                      <input type="radio" value="url" {...register('videoSourceType')} className="sr-only" />
                      <span>Direct URL / CDN Link</span>
                    </label>
                    <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold uppercase cursor-pointer transition-all ${videoSourceType === 'embed' ? 'bg-rose-600/10 border-rose-500 text-white' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:text-neutral-200'}`}>
                      <input type="radio" value="embed" {...register('videoSourceType')} className="sr-only" />
                      <span>HTML Embed Code (Iframe)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2 bg-neutral-950/40 p-4 rounded-2xl border border-white/5">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest block mb-3">ফাইল আপলোড স্টোরেজ টাইপ (File Upload Storage Type)</label>
                  <p className="text-[11px] text-neutral-400 mb-2 leading-relaxed">
                    সরাসরি ফাইল আপলোড করার সময় সেটি কোথায় সেভ হবে তা নির্বাচন করুন। কোনো অ্যাকাউন্ট বা ফায়ারবেস ছাড়াই সম্পূর্ণ ফ্রিতে আনলিমিটেড হোস্টিং, সবার ফোনে ও সকল ডিভাইসে ভিডিও ১০০% প্লে করতে <span className="font-bold text-emerald-400">Hosting Server Storage (রিসোর্স/হোস্টিং স্টোরেজ - রিকমেন্ডেড!)</span> ব্যবহার করুন!
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <label className={`flex flex-col items-center justify-center text-center gap-1 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${uploadStorageType === 'server' ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-lg shadow-emerald-500/5' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:text-neutral-200'}`}>
                      <input type="radio" value="server" {...register('uploadStorageType')} className="sr-only" />
                      <span className="uppercase text-emerald-400 font-extrabold text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded mb-1">👑 100% working & secure</span>
                      <span>Hosting Server</span>
                      <span className="text-[9px] font-normal text-neutral-500 mt-0.5">সবাই দেখতে পারবে (Public)</span>
                    </label>
                    <label className={`flex flex-col items-center justify-center text-center gap-1 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${uploadStorageType === 'pixeldrain' ? 'bg-rose-600/10 border-rose-500/40 text-white' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:text-neutral-200'}`}>
                      <input type="radio" value="pixeldrain" {...register('uploadStorageType')} className="sr-only" />
                      <span className="uppercase text-neutral-400 font-extrabold text-[9px] bg-white/5 px-2 py-0.5 rounded mb-1">⚡ Free Cloud</span>
                      <span>Pixeldrain Storage</span>
                      <span className="text-[9px] font-normal text-neutral-500 mt-0.5">সবাই দেখতে পারবে (Public)</span>
                    </label>
                    <label className={`flex flex-col items-center justify-center text-center gap-1 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${uploadStorageType === 'firebase' ? 'bg-amber-600/10 border-amber-500/40 text-white' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:text-neutral-200'}`}>
                      <input type="radio" value="firebase" {...register('uploadStorageType')} className="sr-only" />
                      <span className="uppercase text-amber-400 font-extrabold text-[9px] bg-amber-500/10 px-2 py-0.5 rounded mb-1">🔥 Account Required</span>
                      <span>Firebase Storage</span>
                      <span className="text-[9px] font-normal text-neutral-500 mt-0.5">সবাই দেখতে পারবে (Public)</span>
                    </label>
                    <label className={`flex flex-col items-center justify-center text-center gap-1 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${uploadStorageType === 'local' ? 'bg-neutral-700/30 border-white/10 text-white' : 'bg-neutral-800 border-white/5 text-neutral-400 hover:text-neutral-200'}`}>
                      <input type="radio" value="local" {...register('uploadStorageType')} className="sr-only" />
                      <span className="uppercase text-neutral-500 font-extrabold text-[9px] bg-white/5 px-2 py-0.5 rounded mb-1">🔒 Offline test</span>
                      <span>Local Browser</span>
                      <span className="text-[9px] font-normal text-neutral-500 mt-0.5">শুধুমাত্র নিজের ফোনে (IndexedDB)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Thumbnail (URL or Upload)</label>
                  <div className="space-y-2">
                    <input {...register('thumbnail')} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-2.5 px-3 focus:outline-none focus:border-rose-500 transition-colors text-xs" placeholder="https://..." />
                    
                    {isGeneratingThumbnail && (
                      <div className="flex items-center gap-2 text-xs text-rose-400 font-semibold animate-pulse py-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>অটোমেটিক থাম্বনেল তৈরি হচ্ছে... (Generating automatic thumbnail...)</span>
                      </div>
                    )}

                    {autoThumbnailPreview && (
                      <div className="p-2.5 bg-neutral-900 border border-white/5 rounded-xl flex items-center gap-3">
                        <img src={autoThumbnailPreview} alt="Auto Preview" className="w-20 h-12 object-cover rounded-lg border border-white/10" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Auto-Generated Thumbnail</p>
                          <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                            <Check className="w-3.5 h-3.5" /> ভিডিও থেকে অটোমেটিক যুক্ত হয়েছে
                          </p>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            clearAutoThumbnail();
                            setValue('thumbnail', '');
                          }}
                          className="p-1 hover:bg-white/5 rounded text-neutral-400 hover:text-white transition-colors"
                          title="Reset"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="relative group">
                      <input 
                        type="file" 
                        ref={thumbFileRef}
                        accept="image/*"
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const sizeInMB = file.size / (1024 * 1024);
                            if (sizeInMB > 5) {
                              alert(`Notice: This image is ${sizeInMB.toFixed(1)}MB. Image uploads should ideally be under 1-2MB for maximum speed. Please compress it or use a web link if possible.`);
                            }
                            setValue('thumbnail', file.name);
                          }
                        }}
                      />
                      <button 
                        type="button"
                        onClick={() => thumbFileRef.current?.click()}
                        className="w-full py-2 bg-neutral-800/40 border border-dashed border-white/10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors"
                      >
                        <ImageIcon className="w-4 h-4 text-neutral-400" />
                        {thumbFileRef.current?.files?.[0] ? thumbFileRef.current.files[0].name : 'Choose Custom Thumbnail File (Optional)'}
                      </button>
                    </div>
                    {progress.thumbnails !== undefined && (
                      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${progress.thumbnails}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                
                {videoSourceType === 'embed' ? (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">HTML Embed Code (iframe/HTML)</label>
                    <textarea 
                      {...register('embedCode')} 
                      className="w-full bg-neutral-800 border border-white/5 rounded-xl py-2.5 px-3 focus:outline-none focus:border-rose-500 transition-colors h-[106px] text-xs font-mono resize-none" 
                      placeholder="e.g. <iframe src='...' width='100%' height='360' ...></iframe>" 
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Video (URL or Upload)</label>
                    <div className="space-y-2">
                      <input {...register('videoUrl')} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-2.5 px-3 focus:outline-none focus:border-rose-500 transition-colors text-xs" placeholder="https://..." />
                      <div className="relative group">
                        <input 
                          type="file" 
                          ref={videoFileRef}
                          accept="video/*"
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const sizeInMB = file.size / (1024 * 1024);
                              if (sizeInMB > 15) {
                                alert(
                                  `⚠️ warning: This video file is very large (${sizeInMB.toFixed(1)} MB)!\n\n` +
                                  "Uploading large files directly can take several minutes or fail completely due to network limits or inactive Firebase Storage rules.\n\n" +
                                  "💡 BEST PRACTICE:\n" +
                                  "We highly recommend uploading your video to Google Drive, Dropbox, YouTube, or free video hosting sites, then pasting the direct video URL in the field above! This guarantees 0-second instant processing."
                                );
                              }
                              setValue('videoUrl', file.name);
                              detectVideoDurationAndThumbnail(file);
                            }
                          }}
                        />
                        <button 
                          type="button"
                          onClick={() => videoFileRef.current?.click()}
                          className="w-full py-2 bg-neutral-800/40 border border-dashed border-white/10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors"
                        >
                          <FileVideo className="w-4 h-4 text-neutral-400" />
                          {videoFileRef.current?.files?.[0] ? videoFileRef.current.files[0].name : 'Choose Video File'}
                        </button>
                      </div>
                      {progress.videos !== undefined && (
                        <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${progress.videos}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload Warning Note */}
                <div className="md:col-span-2 flex items-start gap-2.5 p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-amber-500 text-[11px] leading-relaxed">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">File Upload Notice:</span> Manual video files uploaded directly to Firebase Storage will consume system bandwidth and might take longer to load based on network connection. For immediate deployment, please paste direct streaming links or use the <span className="font-bold text-white underline">Optimization Presets</span> above!
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Category (মেনু)</label>
                  <select {...register('categoryId', { required: true })} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-rose-500 transition-colors text-xs text-neutral-300">
                    {getCategoriesFromMenu().map((cat: any) => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {hasSubmenus ? (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Subcategory (সাবমেনু)</label>
                    <select {...register('subCategoryId')} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-rose-500 transition-colors text-xs text-neutral-300">
                      <option value="">No Subcategory (সাবমেনু ছাড়া)</option>
                      {currentCategoryObj.subMenus.map((sub: any) => (
                        <option key={sub.slug} value={sub.slug}>{sub.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2 opacity-50">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Subcategory (সাবমেনু)</label>
                    <select disabled className="w-full bg-neutral-850 border border-white/5 rounded-xl py-3 px-4 text-xs text-neutral-500 cursor-not-allowed">
                      <option value="">No submenus defined in site settings</option>
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Duration</label>
                  <input {...register('duration')} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-rose-500 transition-colors text-xs text-neutral-300" placeholder="e.g. 10:45 (Optional)" />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Tags (comma separated)</label>
                  <input {...register('tags')} className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-rose-500 transition-colors text-xs text-neutral-300" placeholder="action, sci-fi, 4k" />
                </div>

                <div className="flex flex-wrap items-center gap-6 md:col-span-2 p-4 bg-neutral-850/40 rounded-2xl border border-white/5">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input type="checkbox" {...register('featured')} className="peer sr-only" />
                      <div className="w-10 h-6 bg-neutral-700 peer-checked:bg-rose-600 rounded-full transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-xs font-bold text-neutral-300 group-hover:text-white transition-colors uppercase tracking-wider">Featured</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input type="checkbox" {...register('locked')} className="peer sr-only" />
                      <div className="w-10 h-6 bg-neutral-700 peer-checked:bg-amber-500 rounded-full transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-xs font-bold text-neutral-300 group-hover:text-white transition-colors uppercase tracking-wider">Ad Gate Locked</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input type="checkbox" {...register('isPremium')} className="peer sr-only" />
                      <div className="w-10 h-6 bg-neutral-700 peer-checked:bg-purple-600 rounded-full transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-xs font-bold text-neutral-300 group-hover:text-white transition-colors uppercase tracking-wider">Premium (Subscription)</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input type="checkbox" {...register('published')} className="peer sr-only" />
                      <div className="w-10 h-6 bg-neutral-700 peer-checked:bg-emerald-500 rounded-full transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-xs font-bold text-neutral-300 group-hover:text-white transition-colors uppercase tracking-wider">Published</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 bg-neutral-800 hover:bg-neutral-700 rounded-2xl font-bold transition-all text-xs uppercase tracking-wider">Cancel</button>
                <button 
                  type="submit" 
                  disabled={uploading}
                  className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:bg-neutral-800 disabled:text-neutral-600 rounded-2xl font-bold transition-all shadow-xl shadow-rose-600/20 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>
                        {progress.videos !== undefined && progress.videos < 100
                          ? `ভিডিও আপলোড হচ্ছে... (${progress.videos}%)`
                          : progress.thumbnails !== undefined && progress.thumbnails < 100
                          ? `থাম্বনেল আপলোড হচ্ছে... (${progress.thumbnails}%)`
                          : "সংরক্ষণ করা হচ্ছে..."}
                      </span>
                    </>
                  ) : (
                    editingVideo ? 'Update Stream Asset' : 'Deploy Stream Asset'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
          )}

      {/* High-Fidelity Fullscreen Upload Progress Overlay */}
      {uploading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-950/95 backdrop-blur-xl">
          <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-6 text-center space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500 animate-pulse" />
            
            {/* Spinning/pulsing upload logo */}
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-500 relative">
              <Upload className="w-8 h-8 animate-bounce" />
              <div className="absolute inset-0 rounded-full border-2 border-rose-500/30 animate-ping" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white">মিডিয়া ফাইল আপলোড হচ্ছে...</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                দয়া করে এই পেজটি বন্ধ করবেন না বা রিলোড করবেন না। আপনার ফাইলগুলো ক্লাউডে আপলোড করা হচ্ছে।
              </p>
            </div>

            <div className="space-y-4 text-left">
              {/* Video Progress Bar */}
              {videoFileRef.current?.files?.[0] && (
                <div className="p-3 bg-neutral-950/60 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-neutral-300 flex items-center gap-1.5 truncate max-w-[180px]">
                      <FileVideo className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      {videoFileRef.current.files[0].name}
                    </span>
                    <span className="text-rose-400 font-mono">
                      {progress.videos !== undefined ? `${progress.videos}%` : 'অপেক্ষা করা হচ্ছে...'}
                    </span>
                  </div>
                  
                  {/* File Size details */}
                  <div className="text-[10px] text-neutral-500">
                    আকার: {(videoFileRef.current.files[0].size / (1024 * 1024)).toFixed(2)} MB
                  </div>

                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-500 transition-all duration-300 rounded-full" 
                      style={{ width: `${progress.videos || 0}%` }} 
                    />
                  </div>
                </div>
              )}

              {/* Thumbnail Progress Bar */}
              {(thumbFileRef.current?.files?.[0] || autoThumbnailBlob) && (
                <div className="p-3 bg-neutral-950/60 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-neutral-300 flex items-center gap-1.5 truncate max-w-[180px]">
                      <ImageIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {thumbFileRef.current?.files?.[0] ? thumbFileRef.current.files[0].name : 'Auto-generated Thumbnail'}
                    </span>
                    <span className="text-emerald-400 font-mono">
                      {progress.thumbnails !== undefined ? `${progress.thumbnails}%` : 'অপেক্ষা করা হচ্ছে...'}
                    </span>
                  </div>

                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300 rounded-full" 
                      style={{ width: `${progress.thumbnails || 0}%` }} 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Slow/Failed Upload Assist Note */}
            <div className="p-3.5 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-left text-[11px] text-amber-500/95 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">টিপস (Tips):</span> যদি আপনার ইন্টারনেট ধীরগতির হয় বা কোনো সমস্যা থাকে, তবে সরাসরি ভিডিওর লিংক (যেমন Google Drive বা Dropbox লিংক) উপরের ইনপুট বক্সে পেস্ট করতে পারেন। এতে কোনো আপলোড টাইম ছাড়াই তাৎক্ষণিকভাবে ভিডিও যুক্ত হয়ে যাবে!
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
