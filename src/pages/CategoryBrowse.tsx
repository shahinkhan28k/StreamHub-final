import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Video, SiteSettings } from '../types';
import VideoCard from '../components/VideoCard';
import { ChevronLeft, Play, Filter } from 'lucide-react';
import AdRenderer from '../components/AdRenderer';
import CustomAdsSpot from '../components/CustomAdsSpot';

export default function CategoryBrowse() {
  const { id, subId } = useParams<{ id: string; subId?: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

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
    if (!id) return;

    const fetchVideos = async () => {
      setLoading(true);
      try {
        let q;
        if (subId) {
          q = query(
            collection(db, 'videos'),
            where('categoryId', '==', id),
            where('subCategoryId', '==', subId),
            where('published', '==', true)
          );
        } else {
          q = query(
            collection(db, 'videos'),
            where('categoryId', '==', id),
            where('published', '==', true)
          );
        }
        const snapshot = await getDocs(q);
        setVideos(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Video)));
      } catch (error) {
        console.error("Error fetching category videos:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
    window.scrollTo(0, 0);
  }, [id, subId]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-4">
          <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-full text-xs font-bold text-neutral-300 hover:text-white transition-all shadow-xl">
            <ChevronLeft className="w-4 h-4 text-rose-500" /> ফিরে যান (Go Back)
          </Link>
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight capitalize">
              {subId ? `${id} › ${subId}` : id}
            </h1>
            <p className="text-neutral-400 text-sm">Discover the best {subId || id} content on Deshi Hubx</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 border border-white/5 rounded-full text-sm font-medium hover:bg-neutral-800 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      {/* Custom Extra Ads - Category Top */}
      <CustomAdsSpot settings={siteSettings} placement="category_top" />

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
        <div className="flex flex-col items-center justify-center py-20 space-y-6">
          <div className="w-20 h-20 bg-neutral-900 rounded-3xl flex items-center justify-center">
            <Play className="w-10 h-10 text-neutral-600" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold">No videos yet</h3>
            <p className="text-neutral-400">There are currently no videos in the {id} category.</p>
          </div>
          <Link to="/" className="px-8 py-3 bg-rose-600 rounded-full font-bold">Explore Home</Link>
        </div>
      )}
    </div>
  );
}
