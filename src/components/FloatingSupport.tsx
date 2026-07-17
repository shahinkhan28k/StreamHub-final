import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SiteSettings } from '../types';
import { X, Send, Facebook, MessageCircle } from 'lucide-react';

export default function FloatingSupport() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [showPopup, setShowPopup] = useState(true);
  const [isOpen, setIsOpen] = useState(false); // To toggle popup when clicking icon after dismissal

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as SiteSettings);
      }
    });
    return () => unsub();
  }, []);

  const config = settings?.supportConfig;
  
  // If support widget is disabled or no links are configured, don't show anything
  if (!config?.showTelegramWidget || (!config?.telegramUrl && !config?.facebookUrl)) {
    return null;
  }

  const telegramUrl = config.telegramUrl || '';
  const facebookUrl = config.facebookUrl || '';
  const message = config.widgetMessage || 'যেকোনো সমস্যায় আমাদের সাথে সরাসরি যোগাযোগ করুন!';

  const handleIconClick = () => {
    if (telegramUrl) {
      window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    } else if (facebookUrl) {
      window.open(facebookUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed left-6 bottom-24 z-50 flex flex-col items-start gap-3 select-none">
      {/* Tooltip / Popup message */}
      {(showPopup || isOpen) && (
        <div className="bg-neutral-900/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl max-w-xs w-72 animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
          {/* Close button */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowPopup(false);
              setIsOpen(false);
            }}
            className="absolute top-2 right-2 p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="বন্ধ করুন (Close)"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <h4 className="text-xs font-black uppercase text-rose-500 tracking-wider">হেল্প ডেস্ক (Support Helpdesk)</h4>
            </div>

            <p className="text-xs text-neutral-200 font-medium leading-relaxed">
              {message}
            </p>

            <div className="flex flex-col gap-2 pt-1">
              {telegramUrl && (
                <a 
                  href={telegramUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-500/10 hover:shadow-sky-500/20"
                >
                  <Send className="w-3.5 h-3.5 fill-current" />
                  <span>টেলিগ্রাম সাপোর্ট (Telegram)</span>
                </a>
              )}

              {facebookUrl && (
                <a 
                  href={facebookUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/10 hover:shadow-blue-600/20"
                >
                  <Facebook className="w-3.5 h-3.5 fill-current" />
                  <span>ফেসবুক সাপোর্ট (Facebook)</span>
                </a>
              )}
            </div>
          </div>

          {/* Dialog Arrow indicator pointing to the icon below */}
          <div className="absolute -bottom-2 left-5 w-4 h-4 bg-neutral-900 border-r border-b border-white/10 rotate-45 transform"></div>
        </div>
      )}

      {/* Floating Circular Toggle Button (Telegram-styled) */}
      <div className="relative group">
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-sky-400 to-sky-600 rounded-full blur opacity-40 group-hover:opacity-75 transition duration-500"></div>
        
        <button
          onClick={() => {
            if (!showPopup && !isOpen) {
              setIsOpen(true);
            } else {
              handleIconClick();
            }
          }}
          className="relative flex items-center justify-center w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 duration-200 cursor-pointer"
          title="হেল্প সেন্টার (Support)"
        >
          {/* Custom telegram icon */}
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.69-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.35-.49.97-.74 3.79-1.65 6.32-2.74 7.59-3.27 3.61-1.51 4.36-1.77 4.85-1.78.11 0 .35.03.5.16.13.12.17.28.18.42-.01.07-.01.14-.02.22z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
