import React, { useState, useEffect } from 'react';
import { Play, Info, ChevronRight, TrendingUp, Sparkles, Clock, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Video, SiteSettings } from '../types';
import VideoCard from '../components/VideoCard';
import { motion } from 'motion/react';
import { useSEO } from '../hooks/useSEO';
import { getStoredVideos, subscribeStoredVideos } from '../lib/videoStore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import AdRenderer from '../components/AdRenderer';
import CustomAdsSpot from '../components/CustomAdsSpot';
import { useAuth } from '../context/AuthContext';
import { resolveMediaUrl } from '../lib/indexedDb';

export default function Home() {
  useSEO('Home - Deshi Hubx', 'Stream premium videos and entertainment content on Deshi Hubx - Premium Collection.');
  const { isAdmin } = useAuth();
  const [featuredVideo, setFeaturedVideo] = useState<Video | null>(null);
  const [resolvedFeaturedThumb, setResolvedFeaturedThumb] = useState<string>('');
  const [trendingVideos, setTrendingVideos] = useState<Video[]>([]);
  const [allLatestVideos, setAllLatestVideos] = useState<Video[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // Fetch Site Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const settings = docSnap.data() as SiteSettings;
        setSiteSettings(settings);
      }
    });

    const unsubscribe = subscribeStoredVideos((allVideos) => {
      const publishedVideos = allVideos.filter(v => v.published);

      // Featured
      const featured = publishedVideos.find(v => v.featured);
      if (featured) {
        setFeaturedVideo(featured);
      } else if (publishedVideos.length > 0) {
        setFeaturedVideo(publishedVideos[0]);
      } else {
        setFeaturedVideo(null);
      }

      // Trending (Sorted by views)
      const trending = [...publishedVideos].sort((a, b) => b.views - a.views).slice(0, 6);
      setTrendingVideos(trending);

      // Latest (Sorted by date)
      const latest = [...publishedVideos].sort((a, b) => b.createdAt - a.createdAt);
      setAllLatestVideos(latest);
      
      setLoading(false);
    }, (error) => {
      console.error("Error fetching home data:", error);
      setLoading(false);
    });

    return () => {
      unsubSettings();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const resolveThumb = async () => {
      if (featuredVideo?.thumbnail) {
        const url = await resolveMediaUrl(featuredVideo.thumbnail);
        if (active) {
          setResolvedFeaturedThumb(url);
        }
      } else {
        if (active) setResolvedFeaturedThumb('');
      }
    };
    resolveThumb();
    return () => {
      active = false;
    };
  }, [featuredVideo]);

  const getCategoriesFromMenu = () => {
    const menu = siteSettings?.navigationMenu || [
      { id: '1', label: 'Home', link: '/' },
      { id: '2', label: 'Movies', link: '/category/movies' },
      { id: '3', label: 'Sports', link: '/category/sports' },
      { id: '4', label: 'Gaming', link: '/category/gaming' }
    ];

    return menu.filter((item: any) => item.link !== '/' && item.link !== '#');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isDarkMode = siteSettings?.featureToggles?.darkMode !== false;
  const latestVideos = allLatestVideos;

  return (
    <div className="space-y-12">
      {/* Custom Ads Spot - Homepage Top */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CustomAdsSpot settings={siteSettings} placement="home_top" isAdmin={isAdmin} />
      </div>

      {/* Smartlink Top Alert Bar */}
      {siteSettings?.adConfig?.enabled && siteSettings.adConfig.smartlinkUrl && !isAdmin && (
        <div className="bg-rose-600/10 border-b border-rose-500/20 text-rose-500 py-3 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-pulse">
          <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">PREMIUM</span>
          <span>⚡ High Speed Server 2 ( Ultra HD 4K ) buffer-free streaming is available now!</span>
          <a 
            href={siteSettings.adConfig.smartlinkUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="underline hover:text-white transition-colors flex items-center gap-0.5 font-bold"
          >
            Watch Here <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Hero Banner */}
      {featuredVideo && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 sm:mt-6">
          <div className={`relative min-h-[420px] h-[55vh] sm:h-[60vh] md:h-[65vh] lg:h-[70vh] w-full rounded-3xl overflow-hidden shadow-2xl transition-all ${isDarkMode ? 'shadow-black/40 border border-white/5 bg-neutral-900' : 'shadow-slate-200 border border-slate-200/60 bg-white'}`}>
            {/* Background Image with Ken Burns / Zoom Effect on hover */}
            <div className="absolute inset-0 select-none pointer-events-none overflow-hidden">
              <img 
                src={resolvedFeaturedThumb || featuredVideo.thumbnail} 
                alt={featuredVideo.title}
                className="w-full h-full object-cover transition-transform duration-[6000ms] hover:scale-105"
              />
              {/* Dynamic Gradient Overlays matching Light / Dark Theme */}
              <div className={`absolute inset-0 bg-gradient-to-t ${isDarkMode ? 'from-neutral-950 via-neutral-950/65 to-transparent' : 'from-white via-white/70 to-transparent'} z-10`} />
              <div className={`absolute inset-0 bg-gradient-to-r ${isDarkMode ? 'from-neutral-950/80 via-neutral-950/30 to-transparent' : 'from-white/85 via-white/35 to-transparent'} z-10 hidden md:block`} />
            </div>

            {/* Premium Content Area */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end p-6 sm:p-10 md:p-14 lg:p-16">
              <div className="max-w-3xl space-y-4 sm:space-y-5">
                {/* Sparkles Badge */}
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-600/10 border border-rose-500/20 text-rose-500 text-xs font-bold uppercase tracking-widest w-fit shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                  <span>Featured Content / ফিউচার কন্টেন্ট</span>
                </motion.div>
                
                {/* Title */}
                <motion.h1 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={`text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}
                >
                  {featuredVideo.title}
                </motion.h1>
                
                {/* Description */}
                <motion.p 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`text-sm sm:text-base md:text-lg line-clamp-3 max-w-2xl font-medium leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}
                >
                  {featuredVideo.description}
                </motion.p>
                
                {/* Action Buttons */}
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-wrap items-center gap-3 sm:gap-4 pt-2"
                >
                  <Link 
                    to={`/video/${featuredVideo.id}`}
                    className="flex items-center gap-2 px-6 py-3.5 sm:px-8 sm:py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-full font-bold transition-all hover:scale-[1.03] shadow-lg shadow-rose-600/35 text-xs sm:text-sm md:text-base shrink-0"
                  >
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                    Watch Now / এখনই দেখুন
                  </Link>
                  <Link 
                    to={`/video/${featuredVideo.id}`}
                    className={`flex items-center gap-2 px-6 py-3.5 sm:px-8 sm:py-4 rounded-full font-bold transition-all hover:scale-[1.03] text-xs sm:text-sm md:text-base shrink-0 border ${isDarkMode ? 'bg-white/10 hover:bg-white/15 text-white border-white/5 backdrop-blur-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200/50'}`}
                  >
                    <Info className="w-4 h-4 sm:w-5 sm:h-5" />
                    More Info / বিস্তারিত
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Banner Ad Spot #1 (Below Hero / Above Trending) */}
      {siteSettings?.adConfig?.enabled && siteSettings.adConfig.bannerScript && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-[10px] text-neutral-500 mb-1 font-bold uppercase tracking-widest">Advertisement</div>
          <AdRenderer htmlCode={siteSettings.adConfig.bannerScript} />
        </section>
      )}

      {/* Trending Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Trending Now</h2>
          </div>
          <Link to="/search" className="text-neutral-400 hover:text-white transition-colors flex items-center gap-1 text-sm font-medium">
            See all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {trendingVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      </section>

      {/* Native Banner Ad Spot #2 (Below Trending / Above Categories) */}
      {siteSettings?.adConfig?.enabled && siteSettings.adConfig.nativeBannerScript && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-[10px] text-neutral-500 mb-1 font-bold uppercase tracking-widest">Sponsored Native Add</div>
          <AdRenderer htmlCode={siteSettings.adConfig.nativeBannerScript} />
        </section>
      )}

      {/* Categories Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-y border-white/5 bg-neutral-900/30">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {getCategoriesFromMenu().map((item: any) => (
            <Link 
              key={item.id || item.label}
              to={item.link}
              className="group relative h-24 rounded-xl overflow-hidden bg-neutral-900 border border-white/5 hover:border-rose-500/50 transition-all flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-rose-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative font-bold tracking-wide uppercase text-xs group-hover:scale-110 transition-transform text-center px-4">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Uploads */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-600/10 rounded-lg">
              <Clock className="w-6 h-6 text-rose-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Latest Uploads</h2>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {latestVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      </section>

      {/* Smartlink/Banner Ad Spot #3 (Bottom Spot / Above Footer) */}
      {siteSettings?.adConfig?.enabled && siteSettings.adConfig.smartlinkUrl && !isAdmin && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-rose-500/20 transition-colors">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
                <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" /> Want Buffer-Free Streaming?
              </h3>
              <p className="text-sm text-neutral-400">
                Unlock high-speed direct downloads and premium HD video player servers instantly.
              </p>
            </div>
            <a 
              href={siteSettings.adConfig.smartlinkUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-8 py-4 bg-rose-600 hover:bg-rose-700 hover:scale-105 active:scale-95 text-white font-bold rounded-full transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2 text-sm"
            >
              <span>Connect High-Speed Server</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </section>
      )}
      {/* Custom Ads Spot - Homepage Bottom */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CustomAdsSpot settings={siteSettings} placement="home_bottom" isAdmin={isAdmin} />
      </div>
    </div>
  );
}
