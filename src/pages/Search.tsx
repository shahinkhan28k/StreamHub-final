import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Video, SiteSettings } from '../types';
import VideoCard from '../components/VideoCard';
import { Search as SearchIcon, Filter, SlidersHorizontal, ChevronLeft } from 'lucide-react';
import AdRenderer from '../components/AdRenderer';
import CustomAdsSpot from '../components/CustomAdsSpot';

export default function Search() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  const getCategories = () => {
    if (!siteSettings?.navigationMenu) {
      return [{ label: 'All', id: 'All' }];
    }
    const categories = [{ label: 'All', id: 'All' }];
    siteSettings.navigationMenu.forEach((item) => {
      if (item.label && item.label.toLowerCase() !== 'home') {
        let catId = '';
        if (item.link.startsWith('/category/')) {
          catId = item.link.replace('/category/', '').split('/')[0];
        } else {
          catId = item.label.toLowerCase().trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-');
        }
        if (catId) {
          categories.push({
            label: item.label,
            id: catId
          });
        }
      }
    });
    return categories;
  };

  useEffect(() => {
    // Fetch Site Settings for ads
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSiteSettings(docSnap.data() as SiteSettings);
      }
    });
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const videosRef = collection(db, 'videos');
        let q = query(videosRef, where('published', '==', true));
        
        const snapshot = await getDocs(q);
        let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
        
        // Client side filtering for title (Firestore doesn't support full-text search without external service)
        if (queryParam) {
          results = results.filter(v => 
            v.title.toLowerCase().includes(queryParam.toLowerCase()) || 
            v.description.toLowerCase().includes(queryParam.toLowerCase()) ||
            v.tags?.some(t => t.toLowerCase().includes(queryParam.toLowerCase()))
          );
        }

        if (activeCategory !== 'All') {
          results = results.filter(v => v.categoryId.toLowerCase() === activeCategory.toLowerCase());
        }

        setVideos(results);
      } catch (error) {
        console.error("Error searching videos:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [queryParam, activeCategory]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
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

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {queryParam ? `Results for "${queryParam}"` : 'Browse Videos'}
          </h1>
          <p className="text-neutral-400 text-sm">{videos.length} videos found</p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none whitespace-nowrap">
          {getCategories().map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                activeCategory === cat.id 
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' 
                : 'bg-neutral-900 border border-white/5 text-neutral-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Extra Ads - Search Top */}
      <CustomAdsSpot settings={siteSettings} placement="search_top" />

      {/* Sponsored Native Add Spot */}
      {siteSettings?.adConfig?.enabled && siteSettings.adConfig.nativeBannerScript && (
        <div className="w-full">
          <div className="text-center text-[10px] text-neutral-500 mb-1 font-bold uppercase tracking-widest">Sponsored Native Add</div>
          <AdRenderer htmlCode={siteSettings.adConfig.nativeBannerScript} />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-video bg-neutral-900 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center">
            <SearchIcon className="w-8 h-8 text-neutral-500" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold">No results found</h3>
            <p className="text-neutral-400">Try adjusting your search or filters to find what you're looking for.</p>
          </div>
          <Link to="/" className="text-rose-500 font-bold hover:underline">Go back home</Link>
        </div>
      )}
    </div>
  );
}
