import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Settings, 
  ChevronLeft, Share2, Heart, ThumbsUp, MessageSquare, 
  Lock, ExternalLink, FastForward, Rewind, Megaphone,
  Gamepad2, Download, Send, CheckCircle2, ShieldAlert, Crown
} from 'lucide-react';
import { doc, getDoc, updateDoc, increment, collection, query, where, limit, getDocs, addDoc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Video, Comment, SiteSettings } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import VideoCard from '../components/VideoCard';
import { getSingleStoredVideo, getStoredVideos } from '../lib/videoStore';
import AdRenderer from '../components/AdRenderer';
import CustomAdsSpot from '../components/CustomAdsSpot';
import Hls from 'hls.js';
import { resolveMediaUrl } from '../lib/indexedDb';

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

  return trimmed;
}

// Helper to check if a URL is a direct video file
function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  const processed = preprocessVideoUrl(url);
  const trimmed = processed.toLowerCase();
  
  // Firebase Storage direct uploads are direct video files
  if (trimmed.includes('firebasestorage.googleapis.com')) return true;
  
  // Local files / Blobs
  if (trimmed.startsWith('/') || trimmed.startsWith('file://') || trimmed.startsWith('blob:') || trimmed.startsWith('indexeddb://')) return true;

  // Dropbox with raw=1 is a direct video file
  if (trimmed.includes('dropbox.com') && trimmed.includes('raw=1')) return true;

  // Check extensions
  const extensions = ['.mp4', '.webm', '.ogg', '.m3u8', '.mpd', '.mov', '.avi', '.mkv', '.3gp', '.wmv'];
  
  try {
    const urlObj = new URL(processed);
    const pathname = urlObj.pathname.toLowerCase();
    if (extensions.some(ext => pathname.endsWith(ext))) {
      return true;
    }
  } catch (e) {
    if (extensions.some(ext => trimmed.includes(ext))) {
      return true;
    }
  }

  // Common direct video streams/CDN paths
  if (trimmed.includes('/video/') || trimmed.includes('/stream/') || trimmed.includes('cdn') || trimmed.includes('.mp4')) {
    if (
      !trimmed.includes('youtube.com') && 
      !trimmed.includes('youtu.be') && 
      !trimmed.includes('drive.google.com') && 
      !trimmed.includes('docs.google.com') && 
      !trimmed.includes('vimeo.com') &&
      !trimmed.includes('loom.com') &&
      !trimmed.includes('streamable.com')
    ) {
      return true;
    }
  }

  return false;
}

// Helper to extract iframe / embed URL for standard cloud-hosted platforms
function getEmbedUrl(url: string) {
  if (!url) return null;
  const processed = preprocessVideoUrl(url);
  const trimmed = processed.trim();

  // YouTube Shorts Support
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (shortsMatch && shortsMatch[1]) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}?autoplay=1&rel=0&modestbranding=1`;
  }

  // YouTube Links
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&modestbranding=1`;
  }
  
  // Google Drive Shared Links
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
  }

  // Vimeo Links
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/i);
  if (vimeoMatch && vimeoMatch[3]) {
    return `https://player.vimeo.com/video/${vimeoMatch[3]}?autoplay=1`;
  }

  // Loom Links (e.g. loom.com/share/xxxx or loom.com/file/xxxx)
  if (trimmed.includes('loom.com')) {
    const loomMatch = trimmed.match(/loom\.com\/(?:share|file)\/([a-zA-Z0-9_-]+)/i);
    if (loomMatch && loomMatch[1]) {
      return `https://www.loom.com/embed/${loomMatch[1]}?autoplay=1`;
    }
  }

  // Streamable Links (e.g. streamable.com/xxxx)
  if (trimmed.includes('streamable.com')) {
    const streamableMatch = trimmed.match(/streamable\.com\/([a-zA-Z0-9_-]+)/i);
    if (streamableMatch && streamableMatch[1] && streamableMatch[1] !== 'e') {
      return `https://streamable.com/e/${streamableMatch[1]}`;
    }
  }

  // Dailymotion Links (e.g. dailymotion.com/video/xxxx)
  if (trimmed.includes('dailymotion.com') || trimmed.includes('dai.ly')) {
    const dmMatch = trimmed.match(/(?:dailymotion\.com\/video|dai\.ly)\/([a-zA-Z0-9_-]+)/i);
    if (dmMatch && dmMatch[1]) {
      return `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`;
    }
  }

  // TikTok Links (e.g. tiktok.com/@username/video/xxxx)
  if (trimmed.includes('tiktok.com')) {
    const tiktokMatch = trimmed.match(/video\/(\d+)/i);
    if (tiktokMatch && tiktokMatch[1]) {
      return `https://www.tiktok.com/embed/${tiktokMatch[1]}`;
    }
  }

  // Facebook Videos (e.g. facebook.com/watch/?v=xxxx or facebook.com/username/videos/xxxx/)
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=0&t=0`;
  }

  // Twitch Clips or Videos
  if (trimmed.includes('twitch.tv')) {
    const clipMatch = trimmed.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/i) || trimmed.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/i);
    if (clipMatch && clipMatch[1]) {
      return `https://clips.twitch.tv/embed?clip=${clipMatch[1]}&parent=${window.location.hostname}`;
    }
    const videoMatch = trimmed.match(/twitch\.tv\/videos\/(\d+)/i);
    if (videoMatch && videoMatch[1]) {
      return `https://player.twitch.tv/?video=${videoMatch[1]}&parent=${window.location.hostname}&autoplay=true`;
    }
  }

  // Already an embedded URL (like embed src, or has embedded keyword)
  if (trimmed.includes('/embed/') || trimmed.includes('/preview') || trimmed.includes('player.')) {
    return trimmed;
  }

  // XNXX and XVideos Links Support
  if (trimmed.toLowerCase().includes('xnxx.com') || trimmed.toLowerCase().includes('xvideos.com')) {
    const domain = trimmed.toLowerCase().includes('xnxx.com') ? 'xnxx.com' : 'xvideos.com';
    if (trimmed.includes('/embedframe/')) {
      return trimmed;
    }
    const adultMatch = trimmed.match(/video-([a-zA-Z0-9]+)/i);
    if (adultMatch && adultMatch[1]) {
      return `https://www.${domain}/embedframe/${adultMatch[1]}`;
    }
  }

  // If it is NOT a direct video URL, treat it as a generic embed page
  if (!isDirectVideoUrl(trimmed)) {
    return trimmed;
  }

  return null;
}

// Helper to optimize HTML embed codes (such as iframes) so they support proper navigation, fullscreen, policies, and allow suggested videos to play
function optimizeEmbedCode(html: string): string {
  if (!html) return '';
  let optimized = html;

  // If there's an iframe in the html string
  if (optimized.toLowerCase().includes('<iframe')) {
    // 1. Completely remove any "sandbox" attribute to give the player 100% full privileges to run scripts, handle clicks, store player memory, and play subsequent/suggested videos.
    optimized = optimized.replace(/sandbox=["'][^"']*["']/gi, '');
    optimized = optimized.replace(/\bsandbox\b/gi, '');

    // 2. Adjust referrerpolicy. Many sites (like dood, Streamtape, tape, xvideo) require referrer, but some fail if it's set to "no-referrer". 
    // Setting it to 'strict-origin-when-cross-origin' or removing it is safer. Let's remove any explicit referrerpolicy to let the browser fall back, or use 'strict-origin-when-cross-origin'.
    optimized = optimized.replace(/referrerpolicy=["'][^"']*["']/gi, '');
    optimized = optimized.replace(/<iframe/i, '<iframe referrerpolicy="strict-origin-when-cross-origin"');

    // 3. Ensure allowfullscreen and other browser-specific full screen flags are present
    if (!/allowfullscreen/i.test(optimized)) {
      optimized = optimized.replace(/<iframe/i, '<iframe allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"');
    } else {
      if (!/webkitallowfullscreen/i.test(optimized)) {
        optimized = optimized.replace(/allowfullscreen/gi, 'allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"');
      }
    }

    // 4. Make sure allow="..." includes all capabilities for seamless streaming and interaction
    const allowMatch = optimized.match(/allow=["']([^"']+)["']/i);
    if (allowMatch) {
      const currentAllow = allowMatch[1];
      let newAllow = currentAllow;
      const keyCapabilities = ['autoplay', 'encrypted-media', 'picture-in-picture', 'fullscreen', 'clipboard-write', 'gyroscope', 'accelerometer', 'web-share'];
      keyCapabilities.forEach(cap => {
        if (!newAllow.toLowerCase().includes(cap.toLowerCase())) {
          newAllow += `; ${cap}`;
        }
      });
      optimized = optimized.replace(/allow=["']([^"']+)["']/i, `allow="${newAllow}"`);
    } else {
      optimized = optimized.replace(/<iframe/i, '<iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"');
    }
  }

  return optimized;
}

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

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, isAdmin, isSubscribed, hasPremiumAccess } = useAuth();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [showLockedScreen, setShowLockedScreen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [hasClickedAd, setHasClickedAd] = useState(false);
  const [activeAdCampaign, setActiveAdCampaign] = useState<string | null>(null);
  const timerInterval = useRef<number | null>(null);

  // Like and Save state synced with Firestore for logged-in users, fallback to localStorage
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;

    const checkLikedAndSaved = async () => {
      if (user) {
        try {
          // Check if liked in Firestore
          const favRef = doc(db, 'users', user.uid, 'favorites', id);
          const favSnap = await getDoc(favRef);
          setIsLiked(favSnap.exists());

          // Check if saved in Firestore
          const savedRef = doc(db, 'users', user.uid, 'saved', id);
          const savedSnap = await getDoc(savedRef);
          setIsSaved(savedSnap.exists());
        } catch (err) {
          console.warn("Firestore status check failed, using local fallback", err);
          const likedVideos = JSON.parse(safeLocalStorage.getItem('likedVideos') || '[]');
          setIsLiked(likedVideos.includes(id));
          const savedVideos = JSON.parse(safeLocalStorage.getItem('savedVideos') || '[]');
          setIsSaved(savedVideos.includes(id));
        }
      } else {
        const likedVideos = JSON.parse(safeLocalStorage.getItem('likedVideos') || '[]');
        setIsLiked(likedVideos.includes(id));
        const savedVideos = JSON.parse(safeLocalStorage.getItem('savedVideos') || '[]');
        setIsSaved(savedVideos.includes(id));
      }
    };

    checkLikedAndSaved();
  }, [id, user]);

  useEffect(() => {
    if (!video || !id) return;
    const baseLikes = video.likes || 0;
    setLikeCount(baseLikes);
  }, [video, id]);

  const handleLike = async () => {
    if (!id || !video) return;
    
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => Math.max(0, prev + (newIsLiked ? 1 : -1)));

    // LocalStorage Sync
    const likedVideos = JSON.parse(safeLocalStorage.getItem('likedVideos') || '[]');
    let newLikedVideos = [...likedVideos];
    if (newIsLiked) {
      if (!newLikedVideos.includes(id)) newLikedVideos.push(id);
    } else {
      newLikedVideos = newLikedVideos.filter(vid => vid !== id);
    }
    safeLocalStorage.setItem('likedVideos', JSON.stringify(newLikedVideos));

    try {
      // 1. Update Video likes counter
      const docRef = doc(db, 'videos', id);
      await updateDoc(docRef, { 
        likes: increment(newIsLiked ? 1 : -1) 
      });

      // 2. Add/Remove in user favorites
      if (user) {
        const favRef = doc(db, 'users', user.uid, 'favorites', id);
        if (newIsLiked) {
          await setDoc(favRef, {
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration || '00:00',
            categoryId: video.categoryId,
            views: video.views,
            isPremium: video.isPremium || false,
            createdAt: video.createdAt,
            likedAt: Date.now()
          });
        } else {
          await deleteDoc(favRef);
        }
      }
    } catch (e) {
      console.warn("Could not sync like to Firestore:", e);
    }
  };

  const handleForceLike = async () => {
    if (!id || !video) return;
    setLikeCount(prev => prev + 1);
    try {
      const docRef = doc(db, 'videos', id);
      await updateDoc(docRef, { 
        likes: increment(1) 
      });
    } catch (e) {
      console.warn("Could not force-like in Firestore", e);
    }
  };

  // Automated interaction via URL query parameters and window postMessages
  useEffect(() => {
    if (!id || !video) return;

    let searchString = window.location.search;
    if (!searchString && window.location.hash.includes('?')) {
      const parts = window.location.hash.split('?');
      searchString = parts[1] ? '?' + parts[1] : '';
    }
    const params = new URLSearchParams(searchString);
    const panelLike = params.get('panel_like') === 'true' || params.get('autolike') === 'true' || params.get('action') === 'like';
    const forceLike = params.get('force_like') === 'true' || params.get('add_like') === 'true' || params.get('like') === '1';

    if (forceLike) {
      handleForceLike();
      // Clean query parameters from address bar to prevent double triggers on reload
      const href = window.location.href;
      let cleanHref = href
        .replace(/[?&]force_like=[^&]*/g, '')
        .replace(/[?&]add_like=[^&]*/g, '')
        .replace(/[?&]like=[^&]*/g, '')
        .replace(/\?&/g, '?')
        .replace(/\?$/g, '')
        .replace(/#\?/, '#');
      window.history.replaceState({}, '', cleanHref);
    } else if (panelLike) {
      const likedVideos = JSON.parse(safeLocalStorage.getItem('likedVideos') || '[]');
      if (!likedVideos.includes(id)) {
        handleLike();
      }
      const href = window.location.href;
      let cleanHref = href
        .replace(/[?&]panel_like=[^&]*/g, '')
        .replace(/[?&]autolike=[^&]*/g, '')
        .replace(/[?&]action=[^&]*/g, '')
        .replace(/\?&/g, '?')
        .replace(/\?$/g, '')
        .replace(/#\?/, '#');
      window.history.replaceState({}, '', cleanHref);
    }

    // Message listener for external panel integrations (iframes / webviews)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LIKE_VIDEO' && event.data?.id === id) {
        const likedVideos = JSON.parse(safeLocalStorage.getItem('likedVideos') || '[]');
        if (!likedVideos.includes(id)) {
          handleLike();
        }
      } else if (event.data?.type === 'FORCE_LIKE_VIDEO' && event.data?.id === id) {
        handleForceLike();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [id, video, likeCount]);

  const handleSave = async () => {
    if (!id || !video) return;

    const newIsSaved = !isSaved;
    setIsSaved(newIsSaved);

    // Sync to LocalStorage
    const savedVideos = JSON.parse(safeLocalStorage.getItem('savedVideos') || '[]');
    let newSavedVideos = [...savedVideos];
    if (newIsSaved) {
      if (!newSavedVideos.includes(id)) newSavedVideos.push(id);
    } else {
      newSavedVideos = newSavedVideos.filter(vid => vid !== id);
    }
    safeLocalStorage.setItem('savedVideos', JSON.stringify(newSavedVideos));

    // Sync to Firestore
    try {
      if (user) {
        const savedRef = doc(db, 'users', user.uid, 'saved', id);
        if (newIsSaved) {
          await setDoc(savedRef, {
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration || '00:00',
            categoryId: video.categoryId,
            views: video.views,
            isPremium: video.isPremium || false,
            createdAt: video.createdAt,
            savedAt: Date.now()
          });
        } else {
          await deleteDoc(savedRef);
        }
      }
    } catch (e) {
      console.warn("Could not sync save to Firestore:", e);
    }
  };
  
  // Video Player State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<number | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [hasUpdatedDuration, setHasUpdatedDuration] = useState(false);

  const processedUrl = video ? preprocessVideoUrl(video.videoUrl) : '';
  const embedUrl = getEmbedUrl(processedUrl);

  const [resolvedVideoSrc, setResolvedVideoSrc] = useState('');
  const [resolvedPosterSrc, setResolvedPosterSrc] = useState('');
  const isM3U8 = resolvedVideoSrc ? resolvedVideoSrc.toLowerCase().includes('.m3u8') : false;

  // Reset player states when video ID or resolved source changes to prevent desync
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);
    
    // Pre-populate duration from video.duration to prevent showing 00:00 on initial load
    if (video && video.duration) {
      const parts = video.duration.split(':').map(Number);
      if (parts.length === 2 && !parts.some(isNaN)) {
        setDuration(parts[0] * 60 + parts[1]);
      } else if (parts.length === 3 && !parts.some(isNaN)) {
        setDuration(parts[0] * 3600 + parts[1] * 60 + parts[2]);
      } else {
        setDuration(0);
      }
    } else {
      setDuration(0);
    }

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [id, resolvedVideoSrc, video?.duration]);

  useEffect(() => {
    let active = true;
    const resolveUrls = async () => {
      if (processedUrl) {
        const resolvedUrl = await resolveMediaUrl(processedUrl);
        if (active) setResolvedVideoSrc(resolvedUrl);
      } else {
        if (active) setResolvedVideoSrc('');
      }

      if (video?.thumbnail) {
        const resolvedPoster = await resolveMediaUrl(video.thumbnail);
        if (active) setResolvedPosterSrc(resolvedPoster);
      } else {
        if (active) setResolvedPosterSrc('');
      }
    };
    resolveUrls();
    return () => {
      active = false;
    };
  }, [processedUrl, video?.thumbnail]);

  useEffect(() => {
    if (!id) return;
    setHasUpdatedDuration(false);

    const fetchVideoAndSettings = async () => {
      setLoading(true);
      try {
        // Fetch Settings (Fallback to rich default setup)
        let settings: SiteSettings | null = null;
        try {
          const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
          if (settingsSnap.exists()) {
            settings = settingsSnap.data() as SiteSettings;
          }
        } catch (e) {
          console.warn("Could not read remote settings, using local settings defaults");
        }

        const defaultAdConfig = {
          enabled: true,
          directLink: 'https://example.com/adsterra-direct',
          socialBarScript: '',
          popunderScript: '',
          timerSeconds: 10,
          promoTitle1: 'Free Fire Arena',
          promoDesc1: 'Install & play for 30s to unlock video instantly!',
          promoLink1: 'https://example.com/free-fire-promo',
          promoIcon1: 'game',
          promoTitle2: 'Super VPN Premium',
          promoDesc2: 'Secure your browsing with zero log VPN. Fast & Free!',
          promoLink2: 'https://example.com/vpn-promo',
          promoIcon2: 'download',
          promoTitle3: 'Join Movie Channel',
          promoDesc3: 'Subscribe to our Official Telegram for premium collections!',
          promoLink3: 'https://telegram.org',
          promoIcon3: 'telegram'
        };

        if (!settings) {
          settings = {
            siteName: 'Deshi Hubx',
            primaryColor: '#e11d48',
            footerText: '© 2026 Deshi Hubx. All rights reserved.',
            contactEmail: 'admin@deshihubx.com',
            socialLinks: { twitter: '', facebook: '', instagram: '', youtube: '' },
            featureToggles: { lockedVideoScreen: true, darkMode: true },
            adConfig: defaultAdConfig
          };
        } else {
          // If adConfig is missing or some fields are empty strings/undefined, merge with defaults
          if (!settings.adConfig) {
            settings.adConfig = defaultAdConfig;
          } else {
            settings.adConfig = {
              ...defaultAdConfig,
              ...settings.adConfig
            };

            // Ensure empty strings fallback to default content so buttons are never blank
            if (!settings.adConfig.directLink) {
              settings.adConfig.directLink = defaultAdConfig.directLink;
            }
            if (!settings.adConfig.promoTitle1) {
              settings.adConfig.promoTitle1 = defaultAdConfig.promoTitle1;
              settings.adConfig.promoDesc1 = defaultAdConfig.promoDesc1;
              settings.adConfig.promoLink1 = defaultAdConfig.promoLink1;
            }
            if (!settings.adConfig.promoTitle2) {
              settings.adConfig.promoTitle2 = defaultAdConfig.promoTitle2;
              settings.adConfig.promoDesc2 = defaultAdConfig.promoDesc2;
              settings.adConfig.promoLink2 = defaultAdConfig.promoLink2;
            }
            if (!settings.adConfig.promoTitle3) {
              settings.adConfig.promoTitle3 = defaultAdConfig.promoTitle3;
              settings.adConfig.promoDesc3 = defaultAdConfig.promoDesc3;
              settings.adConfig.promoLink3 = defaultAdConfig.promoLink3;
            }
          }
        }

        setSiteSettings(settings);

        // Fetch Single Video from unified, resilient videoStore
        const videoData = await getSingleStoredVideo(id);
        
        if (videoData) {
          setVideo(videoData);

          // Save to Watch History in Firestore
          if (user) {
            try {
              const historyRef = doc(db, 'users', user.uid, 'history', id);
              await setDoc(historyRef, {
                id: videoData.id,
                title: videoData.title,
                thumbnail: videoData.thumbnail,
                duration: videoData.duration || '00:00',
                categoryId: videoData.categoryId,
                views: videoData.views,
                isPremium: videoData.isPremium || false,
                createdAt: videoData.createdAt,
                lastWatched: Date.now()
              });
            } catch (historyErr) {
              console.warn("Could not save to watch history in Firestore:", historyErr);
            }
          }
          
          if (videoData.locked && !isUnlocked && settings?.adConfig?.enabled && !isAdmin) {
            setShowLockedScreen(true);
            setAdTimer(settings.adConfig.timerSeconds || 10);
          }

          // Try to increment views in remote database
          try {
            const docRef = doc(db, 'videos', id);
            await updateDoc(docRef, { views: increment(1) });
          } catch (e) {
            console.warn("Could not increment view in remote Firestore, operating in standalone mode");
          }

          // Fetch related videos from resilient videoStore
          const allStoredVideos = await getStoredVideos();
          const related = allStoredVideos
            .filter(v => v.categoryId === videoData.categoryId && v.id !== id && v.published)
            .slice(0, 6);
          setRelatedVideos(related);

          // Fetch comments
          try {
            const commentsQ = query(collection(db, 'videos', id, 'comments'), limit(50));
            const commentsSnap = await getDocs(commentsQ);
            if (!commentsSnap.empty) {
              setComments(commentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
            } else {
              // Read local comments fallback
              const cached = safeLocalStorage.getItem(`comments_${id}`);
              if (cached) setComments(JSON.parse(cached));
            }
          } catch (e) {
            console.warn("Firestore comments unavailable, loading locally");
            const cached = safeLocalStorage.getItem(`comments_${id}`);
            if (cached) setComments(JSON.parse(cached));
          }
        } else {
          navigate('/');
        }
      } catch (error) {
        console.error("Error loading fail-safe video details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoAndSettings();
    window.scrollTo(0, 0);
  }, [id, navigate, isUnlocked, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      setShowLockedScreen(false);
    }
  }, [isAdmin]);

  // Controls click-away speed menu closer
  useEffect(() => {
    const handleCloseMenu = () => {
      setShowSpeedMenu(false);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => {
      window.removeEventListener('click', handleCloseMenu);
    };
  }, []);

  // Controls auto-hide mechanism
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeout.current) {
        window.clearTimeout(controlsTimeout.current);
      }
      controlsTimeout.current = window.setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    const container = videoRef.current?.parentElement;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('click', handleMouseMove);
    }

    return () => {
      if (controlsTimeout.current) {
        window.clearTimeout(controlsTimeout.current);
      }
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('click', handleMouseMove);
      }
    };
  }, [isPlaying]);

  // Hls.js initializer
  useEffect(() => {
    let hls: Hls | null = null;
    const videoElement = videoRef.current;

    if (videoElement && resolvedVideoSrc) {
      const isM3U8 = resolvedVideoSrc.toLowerCase().includes('.m3u8');
      
      if (isM3U8) {
        if (Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
          });
          hls.loadSource(resolvedVideoSrc);
          hls.attachMedia(videoElement);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // manifest loaded
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.error("HLS network error, attempting recovery...");
                  hls?.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.error("HLS media error, attempting recovery...");
                  hls?.recoverMediaError();
                  break;
                default:
                  console.error("Fatal HLS error, destroying player.");
                  hls?.destroy();
                  break;
              }
            }
          });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
          videoElement.src = resolvedVideoSrc;
          videoElement.load();
        }
      } else {
        videoElement.src = resolvedVideoSrc;
        videoElement.load();
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [resolvedVideoSrc]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      setCurrentTime(current);
      setDuration(dur);
      if (dur > 0) {
        setProgress((current / dur) * 100);

        // Proactively correct hardcoded durations "03:40" or "00:00" in the database
        if (video && (video.duration === "03:40" || video.duration === "00:00" || !video.duration) && isFinite(dur) && !hasUpdatedDuration) {
          setHasUpdatedDuration(true);
          const formatted = formatTime(dur);
          if (formatted !== video.duration) {
            // Update local state
            setVideo(prev => prev ? { ...prev, duration: formatted } : null);
            // Update local storage and Firestore
            try {
              const docRef = doc(db, 'videos', video.id);
              updateDoc(docRef, { duration: formatted }).catch(err => console.warn(err));
              
              // Also update localStorage so changes are immediate locally
              const localData = safeLocalStorage.getItem('novastream_local_videos');
              if (localData) {
                const locals = JSON.parse(localData) as Video[];
                const updated = locals.map(v => v.id === video.id ? { ...v, duration: formatted } : v);
                safeLocalStorage.setItem('novastream_local_videos', JSON.stringify(updated));
              }
            } catch (err) {
              console.warn("Stand-alone duration sync skipped", err);
            }
          }
        }
      }
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      const newProgress = parseFloat(e.target.value);
      const newTime = (newProgress / 100) * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setProgress(newProgress);
      setCurrentTime(newTime);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      const parent = videoRef.current.parentElement;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (parent?.requestFullscreen) {
        parent.requestFullscreen();
      }
    }
  };

  const skipBackward = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  };

  const skipForward = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
    }
  };

  const changeSpeed = (e: React.MouseEvent, rate: number) => {
    e.stopPropagation();
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds === Infinity) return "00:00";
    const hrs = Math.floor(timeInSeconds / 3600);
    const mins = Math.floor((timeInSeconds % 3600) / 60);
    const secs = Math.floor(timeInSeconds % 60);
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !id) return;

    try {
      const commentData = {
        videoId: id,
        userId: user.uid,
        userName: profile?.name || 'Anonymous',
        userAvatar: profile?.avatar || '',
        text: newComment,
        createdAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'videos', id, 'comments'), commentData);
      setComments([{ id: docRef.id, ...commentData }, ...comments]);
      setNewComment('');
    } catch (error) {
      console.error("Error posting comment:", error);
    }
  };

  const startAdTimer = () => {
    if (timerInterval.current) return;
    
    timerInterval.current = window.setInterval(() => {
      setAdTimer(prev => {
        if (prev <= 1) {
          if (timerInterval.current) clearInterval(timerInterval.current);
          timerInterval.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handlePromoClick = async (url: string | undefined, campaignTitle: string) => {
    if (!url) return;
    
    // Increment ad clicks in DB
    if (video) {
      try {
        await updateDoc(doc(db, 'videos', video.id), { adClicks: increment(1) });
      } catch (e) {
        console.warn("Could not increment adClicks in Firestore, incrementing locally");
      }
      video.adClicks = (video.adClicks || 0) + 1;
    }

    setActiveAdCampaign(campaignTitle);
    window.open(url, '_blank');
    setHasClickedAd(true);
    setAdTimer(siteSettings?.adConfig?.timerSeconds || 10);
    startAdTimer();
  };

  const handleUnlockContent = () => {
    if (adTimer === 0 && hasClickedAd) {
      setIsUnlocked(true);
      setShowLockedScreen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-neutral-400 gap-4">
        <div className="w-12 h-12 border-4 border-rose-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold tracking-wide">Loading Premium Player...</p>
      </div>
    );
  }

  if (!video) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Modern Back Button */}
      <div className="flex items-center">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-full text-xs font-bold text-neutral-300 hover:text-white transition-all shadow-xl"
        >
          <ChevronLeft className="w-4 h-4 text-rose-500" />
          <span>ফিরে যান (Go Back)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Player Container */}
        <div className="relative aspect-video bg-neutral-950 rounded-3xl overflow-hidden group shadow-2xl border border-white/5">
          {video?.isPremium && !hasPremiumAccess ? (
            <div className="absolute inset-0 z-25 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center select-none overflow-y-auto">
              <div className="w-full max-w-md flex flex-col items-center justify-center h-full space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 text-purple-500 animate-bounce">
                  <Crown className="w-8 h-8 fill-current" />
                </div>
                
                <div className="space-y-2">
                  <span className="px-3 py-1 bg-purple-600/10 border border-purple-500/20 rounded-full text-purple-400 text-[10px] font-bold uppercase tracking-widest">
                    প্রিমিয়াম ভিডিও (Premium Video)
                  </span>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    এই ভিডিওটি দেখতে সাবস্ক্রিপশন প্রয়োজন
                  </h2>
                  <p className="text-neutral-400 text-xs md:text-sm max-w-sm mx-auto leading-relaxed">
                    এটি একটি প্রিমিয়াম ভিডিও। দেখার জন্য মাসিক বা বাৎসরিক মেম্বারশিপ প্যাকেজটি সাবস্ক্রাইব করুন।
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 w-full">
                  <button 
                    onClick={() => navigate('/subscription')}
                    className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-purple-600/10 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                  >
                    <Crown className="w-4 h-4 fill-current" />
                    সাবস্ক্রিপশন প্যাকেজ দেখুন (View Subscription Plans)
                  </button>
                  <button 
                    onClick={() => navigate('/')}
                    className="w-full py-3.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl font-bold transition-all text-xs uppercase tracking-wider border border-white/5"
                  >
                    হোম পেজে ফিরে যান (Go to Home)
                  </button>
                </div>
              </div>
            </div>
          ) : showLockedScreen ? (
            <div className="absolute inset-0 z-20 bg-neutral-950 flex flex-col items-center justify-center p-4 md:p-6 text-center select-none overflow-y-auto">
              {!hasClickedAd ? (
                <div className="w-full max-w-2xl flex flex-col items-center justify-center h-full">
                  <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-2 animate-pulse">
                    <Lock className="w-3.5 h-3.5" /> Premium Sponsor Gate
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Select an Offer to Unlock Video</h2>
                  <p className="text-neutral-400 text-xs md:text-sm max-w-md mt-1 mb-4 leading-relaxed">
                    Choose any of our trusted partners below. The premium streaming content will unlock immediately after completion!
                  </p>
                  
                  {/* Offers Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    {/* Adsterra Direct Link */}
                    {siteSettings?.adConfig?.showDirectLink !== false && siteSettings?.adConfig?.directLink && (
                      <button 
                        onClick={() => handlePromoClick(siteSettings?.adConfig?.directLink, 'Sponsor Fast Link')}
                        className="flex items-center gap-3 p-3 bg-neutral-900 hover:bg-neutral-800/80 border border-white/5 hover:border-amber-500/40 rounded-2xl text-left transition-all hover:scale-[1.02] duration-200 group"
                      >
                        <div className="p-2.5 bg-amber-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Megaphone className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                            Sponsor Fast Link <ExternalLink className="w-3 h-3 text-neutral-500" />
                          </h4>
                          <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">Quickly unlock using sponsor fast redirect.</p>
                        </div>
                      </button>
                    )}

                    {/* Promo Campaign 1 */}
                    {siteSettings?.adConfig?.showPromo1 !== false && siteSettings?.adConfig?.promoTitle1 && (
                      <button 
                        onClick={() => handlePromoClick(siteSettings?.adConfig?.promoLink1, siteSettings?.adConfig?.promoTitle1 || 'Offer 1')}
                        className="flex items-center gap-3 p-3 bg-neutral-900 hover:bg-neutral-800/80 border border-white/5 hover:border-rose-500/40 rounded-2xl text-left transition-all hover:scale-[1.02] duration-200 group"
                      >
                        <div className="p-2.5 bg-rose-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Gamepad2 className="w-5 h-5 text-rose-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                            {siteSettings.adConfig.promoTitle1} <ExternalLink className="w-3 h-3 text-neutral-500" />
                          </h4>
                          <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">{siteSettings.adConfig.promoDesc1 || 'Install and launch mobile application.'}</p>
                        </div>
                      </button>
                    )}

                    {/* Promo Campaign 2 */}
                    {siteSettings?.adConfig?.showPromo2 !== false && siteSettings?.adConfig?.promoTitle2 && (
                      <button 
                        onClick={() => handlePromoClick(siteSettings?.adConfig?.promoLink2, siteSettings?.adConfig?.promoTitle2 || 'Offer 2')}
                        className="flex items-center gap-3 p-3 bg-neutral-900 hover:bg-neutral-800/80 border border-white/5 hover:border-blue-500/40 rounded-2xl text-left transition-all hover:scale-[1.02] duration-200 group"
                      >
                        <div className="p-2.5 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Download className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                            {siteSettings.adConfig.promoTitle2} <ExternalLink className="w-3 h-3 text-neutral-500" />
                          </h4>
                          <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">{siteSettings.adConfig.promoDesc2 || 'Download recommended premium app.'}</p>
                        </div>
                      </button>
                    )}

                    {/* Promo Campaign 3 */}
                    {siteSettings?.adConfig?.showPromo3 !== false && siteSettings?.adConfig?.promoTitle3 && (
                      <button 
                        onClick={() => handlePromoClick(siteSettings?.adConfig?.promoLink3, siteSettings?.adConfig?.promoTitle3 || 'Offer 3')}
                        className="flex items-center gap-3 p-3 bg-neutral-900 hover:bg-neutral-800/80 border border-white/5 hover:border-emerald-500/40 rounded-2xl text-left transition-all hover:scale-[1.02] duration-200 group"
                      >
                        <div className="p-2.5 bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Send className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                            {siteSettings.adConfig.promoTitle3} <ExternalLink className="w-3 h-3 text-neutral-500" />
                          </h4>
                          <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">{siteSettings.adConfig.promoDesc3 || 'Join group or follow telegram channel.'}</p>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-4">
                  <div className="w-16 h-16 rounded-full border-4 border-neutral-800 border-t-rose-500 animate-spin flex items-center justify-center relative mb-4">
                    <span className="absolute text-lg font-black text-rose-500">{adTimer}</span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Unlocking Premium Stream
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                    Verifying interaction with <span className="text-rose-500 font-bold">{activeAdCampaign}</span>. Content unlocks immediately as soon as the sponsor timer reaches zero!
                  </p>

                  <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
                    <button 
                      onClick={handleUnlockContent}
                      disabled={adTimer > 0}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-neutral-950 rounded-xl font-bold transition-all shadow-xl shadow-emerald-500/10 flex items-center justify-center gap-2 text-sm"
                    >
                      {adTimer > 0 ? (
                        `Waiting for partner... ${adTimer}s`
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Watch Now
                        </>
                      )}
                    </button>
                    <button 
                      onClick={() => setHasClickedAd(false)} 
                      className="text-[11px] text-neutral-500 hover:text-neutral-300 font-semibold transition-colors mt-2"
                    >
                      ← Back to Offerwall
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full h-full group bg-black overflow-hidden rounded-2xl" onMouseMove={() => setShowControls(true)}>
              {video.videoSourceType === 'embed' && video.embedCode ? (
                <div className="w-full h-full relative bg-black">
                  <div 
                    className="w-full h-full absolute inset-0 flex items-center justify-center [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:border-0"
                    dangerouslySetInnerHTML={{ __html: optimizeEmbedCode(video.embedCode) }}
                  />
                  {/* Floating Back Button for Custom Embeds */}
                  <div className="absolute top-4 left-4 z-10">
                    <Link to="/" className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full transition-colors flex items-center justify-center">
                      <ChevronLeft className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              ) : embedUrl ? (
                <div className="w-full h-full relative">
                  <iframe
                    src={embedUrl}
                    className="w-full h-full border-0 absolute inset-0 z-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen={true}
                    // @ts-ignore
                    webkitallowfullscreen="true"
                    // @ts-ignore
                    mozallowfullscreen="true"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                  {/* Floating Back Button for Iframe Embeds */}
                  <div className="absolute top-4 left-4 z-10">
                    <Link to="/" className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full transition-colors flex items-center justify-center">
                      <ChevronLeft className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full relative bg-neutral-950 flex items-center justify-center">
                  {processedUrl ? (
                    <div className="w-full h-full relative group">
                      <video
                        key={video?.id || 'video-player'}
                        ref={videoRef}
                        src={isM3U8 ? undefined : (resolvedVideoSrc || undefined)}
                        poster={resolvedPosterSrc || video.thumbnail}
                        className="w-full h-full object-contain bg-black cursor-pointer"
                        preload="auto"
                        playsInline
                        webkit-playsinline="true"
                        onClick={togglePlay}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleTimeUpdate}
                        onDurationChange={handleTimeUpdate}
                        onCanPlay={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                      />
                      
                      {/* Premium Custom Player Controls Overlay */}
                      <div 
                        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 md:p-6 flex flex-col gap-3 transition-opacity duration-300 z-20 ${
                          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Progress Bar (Scrubber) */}
                        <div className="flex items-center gap-3 w-full">
                          <span className="text-[10px] font-mono text-neutral-300 select-none">
                            {formatTime(currentTime)}
                          </span>
                          <input 
                            type="range"
                            min="0"
                            max="100"
                            step="0.01"
                            value={isNaN(progress) ? 0 : progress}
                            onChange={handleScrub}
                            className="flex-1 h-1.5 bg-neutral-700/60 rounded-lg appearance-none cursor-pointer accent-rose-600 focus:outline-none focus:ring-0"
                            style={{
                              background: `linear-gradient(to right, #e11d48 0%, #e11d48 ${progress}%, rgba(82, 82, 82, 0.6) ${progress}%, rgba(82, 82, 82, 0.6) 100%)`
                            }}
                          />
                          <span className="text-[10px] font-mono text-neutral-300 select-none">
                            {duration === Infinity ? (
                              <span className="flex items-center gap-1 text-rose-500 font-bold tracking-wider uppercase text-[9px] animate-pulse">
                                <span className="w-1.5 h-1.5 bg-rose-600 rounded-full" /> LIVE
                              </span>
                            ) : (
                              formatTime(duration)
                            )}
                          </span>
                        </div>

                        {/* Control Buttons Row */}
                        <div className="flex items-center justify-between">
                          {/* Left Controls */}
                          <div className="flex items-center gap-4">
                            <button 
                              type="button"
                              onClick={togglePlay}
                              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white"
                              title={isPlaying ? "Pause" : "Play"}
                            >
                              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                            </button>

                            {/* Skip 10s Backward */}
                            <button 
                              type="button"
                              onClick={skipBackward}
                              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-300 hover:text-white"
                              title="Rewind 10s"
                            >
                              <Rewind className="w-5 h-5" />
                            </button>

                            {/* Skip 10s Forward */}
                            <button 
                              type="button"
                              onClick={skipForward}
                              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-300 hover:text-white"
                              title="Fast Forward 10s"
                            >
                              <FastForward className="w-5 h-5" />
                            </button>

                            {/* Volume Control */}
                            <div className="flex items-center gap-2 group/volume">
                              <button 
                                type="button"
                                onClick={toggleMute}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-300 hover:text-white"
                              >
                                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                              </button>
                              <input 
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-16 h-1 bg-neutral-700/60 rounded-lg appearance-none cursor-pointer accent-white hover:accent-rose-500 md:w-20 transition-all"
                              />
                            </div>
                          </div>

                          {/* Right Controls */}
                          <div className="flex items-center gap-3 relative">
                            {/* Speed Button */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowSpeedMenu(!showSpeedMenu);
                                }}
                                className="px-2.5 py-1 text-xs font-bold text-neutral-300 hover:text-white bg-neutral-900/80 hover:bg-neutral-800 rounded-lg border border-white/5 flex items-center gap-1 transition-all"
                              >
                                <span>{playbackRate === 1 ? 'Normal' : `${playbackRate}x`}</span>
                                <span className="text-[10px] text-neutral-400 font-normal">Speed</span>
                              </button>

                              {showSpeedMenu && (
                                <div className="absolute bottom-full right-0 mb-2 w-28 bg-neutral-900 border border-white/10 rounded-xl py-1.5 shadow-2xl z-30">
                                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                    <button
                                      key={rate}
                                      type="button"
                                      onClick={(e) => changeSpeed(e, rate)}
                                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-white/5 transition-colors ${
                                        playbackRate === rate ? 'text-rose-500' : 'text-neutral-300'
                                      }`}
                                    >
                                      {rate === 1 ? 'Normal (1x)' : `${rate}x`}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Fullscreen */}
                            <button 
                              type="button"
                              onClick={toggleFullscreen}
                              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-300 hover:text-white"
                              title="Fullscreen"
                            >
                              <Maximize className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Big Center Play Button Overlay */}
                      {!isPlaying && (
                        <div 
                          onClick={togglePlay}
                          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 cursor-pointer transition-colors pb-12 z-10"
                        >
                          <button
                            type="button"
                            className="w-16 h-16 bg-rose-600 hover:bg-rose-700 text-white rounded-full flex items-center justify-center shadow-2xl transition-all scale-100 hover:scale-110 active:scale-95 border border-white/10"
                          >
                            <Play className="w-8 h-8 fill-current translate-x-0.5 text-white" />
                          </button>
                        </div>
                      )}
                      
                      {/* Premium Floating Back Button */}
                      <div className="absolute top-4 left-4 z-20">
                        <Link to="/" className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full transition-colors flex items-center justify-center">
                          <ChevronLeft className="w-5 h-5" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 text-neutral-500">
                      <Play className="w-12 h-12 mb-4 opacity-20" />
                      <p>Video source not available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info & Actions Header - Now placed directly below the player */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">{video.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              id="video-like-btn"
              onClick={handleLike}
              className={`flex items-center gap-2 px-4 py-2 border rounded-full transition-all text-sm font-medium ${
                isLiked 
                  ? 'bg-rose-600/10 border-rose-500 text-rose-500 hover:bg-rose-600/20 shadow-lg shadow-rose-600/5' 
                  : 'bg-neutral-900 border-white/5 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              <ThumbsUp className={`w-4 h-4 ${isLiked ? 'fill-current text-rose-500' : ''}`} /> 
              <span>{isLiked ? 'Liked' : 'Like'} ({likeCount})</span>
            </button>
            <button 
              id="video-share-btn"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-white/5 rounded-full hover:bg-neutral-800 transition-colors text-sm font-medium text-neutral-300"
            >
              <Share2 className="w-4 h-4" /> {copied ? 'Copied!' : 'Share'}
            </button>
            <button 
              id="video-save-btn"
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2 border rounded-full transition-all text-sm font-medium ${
                isSaved 
                  ? 'bg-rose-600/10 border-rose-500 text-rose-500 hover:bg-rose-600/20 shadow-lg shadow-rose-600/5' 
                  : 'bg-neutral-900 border-white/5 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              <Heart className={`w-4 h-4 ${isSaved ? 'fill-current text-rose-500' : ''}`} /> 
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
          </div>
        </div>

        {/* Banner Ad Spot #1 (Below Title/Actions) */}
        {siteSettings?.adConfig?.enabled && siteSettings.adConfig.bannerScript && (
          <div className="w-full">
            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1 text-center">Advertisement</div>
            <AdRenderer htmlCode={siteSettings.adConfig.bannerScript} />
          </div>
        )}

        {/* Sponsored Native Add (Below Title/Actions / Above Description Card) */}
        {siteSettings?.adConfig?.enabled && siteSettings.adConfig.nativeBannerScript && (
          <div className="w-full">
            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1 text-center">Sponsored Native Add</div>
            <AdRenderer htmlCode={siteSettings.adConfig.nativeBannerScript} />
          </div>
        )}

        {/* Custom Extra Ads - Below Player (Positioned under Title/Actions) */}
        <CustomAdsSpot settings={siteSettings} placement="video_below_player" isAdmin={isAdmin} />

        {/* Info & Details Card */}
        <div className="p-4 bg-neutral-900 rounded-xl border border-white/5 space-y-4">
          <div className="flex items-center gap-4 text-sm font-medium">
            <span className="text-white">{video.views.toLocaleString()} views</span>
            <span className="text-neutral-500">•</span>
            <span className="text-neutral-500">{formatDistanceToNow(video.createdAt)} ago</span>
            <span className="bg-rose-600/10 text-rose-500 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
              {video.categoryId}
            </span>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed whitespace-pre-wrap">
             {video.description}
          </p>
          <div className="flex flex-wrap gap-2">
            {video.tags?.map(tag => (
              <span key={tag} className="text-[10px] bg-neutral-800 px-2 py-1 rounded-md text-neutral-400">#{tag}</span>
            ))}
          </div>

          {/* Direct Play/Download helper */}
          <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-rose-300 mt-4">
            <div className="space-y-1 col-span-1">
              <span className="font-bold flex items-center gap-1.5 text-rose-400">
                <Play className="w-3.5 h-3.5 fill-current" /> প্লেয়ারে সমস্যা হলে (If player has issue)
              </span>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                ভিডিও লোড হতে সময় নিলে বা সমস্যা হলে আপনি সরাসরি নিচের লিংকে ক্লিক করে নতুন ট্যাবে প্লে অথবা ডাউনলোড করতে পারেন।
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-auto">
              <a 
                href={video.videoUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl font-bold text-xs transition-colors border border-rose-500/30 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" /> সরাসরি প্লে করুন (Play Direct)
              </a>
              {siteSettings?.adConfig?.enabled && siteSettings.adConfig.smartlinkUrl && !isAdmin && (
                <a 
                  href={siteSettings.adConfig.smartlinkUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors shadow-lg shadow-rose-600/20 border border-white/5 shrink-0"
                >
                  ⚡ হাই স্পিড সার্ভার (HD Server 2)
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Comments Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-neutral-400" />
            <h3 className="text-lg font-bold">Comments ({comments.length})</h3>
          </div>

          {user ? (
            <form onSubmit={handleCommentSubmit} className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-neutral-800 flex-shrink-0 overflow-hidden">
                {profile?.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full bg-transparent border-b border-white/10 focus:border-rose-500 transition-colors py-2 text-sm focus:outline-none resize-none"
                  rows={1}
                />
                <div className="flex justify-end">
                  <button 
                    type="submit"
                    disabled={!newComment.trim()}
                    className="px-6 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:hover:bg-rose-600 rounded-full text-sm font-bold transition-all"
                  >
                    Post Comment
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="p-4 bg-neutral-900 border border-white/5 rounded-xl text-center">
              <p className="text-neutral-400 text-sm mb-4">Log in to join the conversation</p>
              <Link to="/login" className="px-6 py-2 bg-rose-600 rounded-full text-sm font-bold">Login</Link>
            </div>
          )}

          <div className="space-y-6">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex-shrink-0 overflow-hidden">
                  {comment.userAvatar ? <img src={comment.userAvatar} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{comment.userName}</span>
                    <span className="text-[10px] text-neutral-500">{formatDistanceToNow(comment.createdAt)} ago</span>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed">{comment.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar - Related Videos */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Play className="w-4 h-4 text-rose-600" />
          Related Videos
        </h3>

        {/* Native Banner Ad Spot */}
        {siteSettings?.adConfig?.enabled && siteSettings.adConfig.nativeBannerScript && (
          <div className="p-1 bg-neutral-900 border border-white/5 rounded-2xl">
            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest text-center py-1">Sponsored Native Add</div>
            <AdRenderer htmlCode={siteSettings.adConfig.nativeBannerScript} />
          </div>
        )}

        {/* Custom Extra Ads - Sidebar */}
        <CustomAdsSpot settings={siteSettings} placement="video_sidebar" isAdmin={isAdmin} />

        <div className="flex flex-col gap-4">
          {relatedVideos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
          {relatedVideos.length === 0 && (
            <p className="text-neutral-500 text-sm italic">No related videos found.</p>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
