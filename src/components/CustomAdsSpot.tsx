import React from 'react';
import { SiteSettings } from '../types';
import AdRenderer from './AdRenderer';

interface CustomAdsSpotProps {
  settings: SiteSettings | null;
  placement: 'home_top' | 'home_bottom' | 'video_below_player' | 'video_sidebar' | 'category_top' | 'search_top' | 'profile_top';
  isAdmin?: boolean;
}

export default function CustomAdsSpot({ settings, placement, isAdmin = false }: CustomAdsSpotProps) {
  if (isAdmin || !settings?.adConfig?.enabled) return null;
  
  const ads = settings.adConfig.customAds?.filter(ad => ad.placement === placement && ad.enabled && ad.code) || [];
  if (ads.length === 0) return null;

  return (
    <div className="w-full space-y-4 my-6">
      {ads.map(ad => (
        <div key={ad.id} className="w-full">
          <div className="text-center text-[9px] text-neutral-500 mb-1 font-bold uppercase tracking-widest">
            {ad.name || 'Sponsored Content'}
          </div>
          <AdRenderer htmlCode={ad.code} />
        </div>
      ))}
    </div>
  );
}
