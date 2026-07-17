import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Eye, Clock, Calendar, Lock, Crown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Video } from '../types';
import { motion } from 'motion/react';
import { resolveMediaUrl } from '../lib/indexedDb';

interface VideoCardProps {
  video: Video;
}

const VideoCard: React.FC<{ video: Video }> = ({ video }) => {
  const [imgError, setImgError] = React.useState(false);
  const [resolvedThumbnail, setResolvedThumbnail] = useState<string>('');

  useEffect(() => {
    let active = true;
    const loadThumbnail = async () => {
      if (video.thumbnail) {
        const url = await resolveMediaUrl(video.thumbnail);
        if (active) {
          setResolvedThumbnail(url);
        }
      } else {
        if (active) setResolvedThumbnail('');
      }
    };
    loadThumbnail();
    return () => {
      active = false;
    };
  }, [video.thumbnail]);

  return (
    <div
      className="group relative bg-neutral-900 rounded-xl overflow-hidden border border-white/5 md:hover:border-rose-500/30 transition-[transform,border-color,box-shadow] duration-300 shadow-lg md:hover:-translate-y-1 transform-gpu will-change-transform"
    >
      <Link to={`/video/${video.id}`}>
        <div className="relative aspect-video overflow-hidden bg-neutral-950">
          {!imgError && resolvedThumbnail ? (
            <img
              src={resolvedThumbnail}
              alt={video.title}
              className="w-full h-full object-cover transition-transform duration-500 md:group-hover:scale-110"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-950 to-neutral-900 flex flex-col items-center justify-center p-4 text-center select-none border-b border-white/5">
              <div className="w-10 h-10 rounded-full bg-rose-600/10 flex items-center justify-center border border-rose-500/20 mb-1">
                <Play className="w-5 h-5 text-rose-500 fill-current translate-x-0.5" />
              </div>
              <span className="text-[9px] text-neutral-500 font-black uppercase tracking-wider">{video.categoryId || 'Premium'}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/20 md:group-hover:bg-black/0 transition-colors" />
          
          {video.locked && (
            <div className="absolute top-2 right-2 bg-neutral-950/80 backdrop-blur-md p-1.5 rounded-full border border-white/10">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
            </div>
          )}
          
          {video.isPremium && (
            <div className="absolute top-2 left-2 bg-purple-600 text-white flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg border border-purple-400/20 z-10">
              <Crown className="w-3 h-3 fill-current text-white animate-pulse" />
              <span>Premium</span>
            </div>
          )}
          
          <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
            {video.duration}
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 bg-rose-600 rounded-full flex items-center justify-center shadow-2xl">
              <Play className="w-6 h-6 text-white fill-current translate-x-0.5" />
            </div>
          </div>
        </div>
        
        <div className="p-3">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-rose-500 transition-colors">
                {video.title}
              </h3>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
            <span className="bg-neutral-800 px-2 py-0.5 rounded uppercase font-bold tracking-wider text-[9px] text-neutral-300">
              {video.categoryId}
            </span>
            {video.subCategoryId && (
              <span className="bg-rose-950/40 text-rose-300 border border-rose-500/10 px-2 py-0.5 rounded uppercase font-bold tracking-wider text-[9px]">
                {video.subCategoryId}
              </span>
            )}
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span>{video.views.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDistanceToNow(video.createdAt)} ago</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default VideoCard;
