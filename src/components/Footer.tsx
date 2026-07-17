import React, { useState, useEffect } from 'react';
import { Facebook, Twitter, Instagram, Youtube, Play, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SiteSettings } from '../types';

export default function Footer() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as SiteSettings);
      }
    });
    return () => unsub();
  }, []);

  const socialLinks = settings?.socialLinks;
  const telegramUrl = settings?.supportConfig?.telegramUrl;
  const facebookUrl = settings?.supportConfig?.facebookUrl;

  return (
    <footer className="bg-neutral-950 border-t border-white/5 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-current" />
              </div>
              <span className="text-xl font-bold tracking-tight">{settings?.siteName || 'Deshi Hubx'}</span>
            </Link>
            <p className="text-neutral-400 text-sm leading-relaxed mb-6">
              Experience the best in streaming. Movies, sports, gaming, and more - all in one place with premium quality and performance.
            </p>
            <div className="flex items-center gap-4">
              {socialLinks?.facebook ? (
                <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
              ) : facebookUrl ? (
                <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
              ) : (
                <a href="#" className="text-neutral-500 hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
              )}
              
              {socialLinks?.twitter ? (
                <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a>
              ) : (
                <a href="#" className="text-neutral-500 hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a>
              )}

              {socialLinks?.instagram ? (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors"><Instagram className="w-5 h-5" /></a>
              ) : (
                <a href="#" className="text-neutral-500 hover:text-white transition-colors"><Instagram className="w-5 h-5" /></a>
              )}

              {socialLinks?.youtube ? (
                <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors"><Youtube className="w-5 h-5" /></a>
              ) : (
                <a href="#" className="text-neutral-500 hover:text-white transition-colors"><Youtube className="w-5 h-5" /></a>
              )}

              {telegramUrl && (
                <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors" title="Telegram Support"><Send className="w-4 h-4 fill-current" /></a>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-6">Explore</h4>
            <ul className="space-y-4 text-sm text-neutral-400">
              <li><Link to="/" className="hover:text-white transition-colors">Featured</Link></li>
              <li><Link to="/" className="hover:text-white transition-colors">Trending</Link></li>
              <li><Link to="/" className="hover:text-white transition-colors">Latest</Link></li>
              <li><Link to="/category/gaming" className="hover:text-white transition-colors">Gaming</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-6">Support</h4>
            <ul className="space-y-4 text-sm text-neutral-400">
              <li><Link to="/" className="hover:text-white transition-colors">FAQ</Link></li>
              {telegramUrl ? (
                <li><a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1">Telegram Support</a></li>
              ) : (
                <li><Link to="/" className="hover:text-white transition-colors">Contact Us</Link></li>
              )}
              {facebookUrl ? (
                <li><a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1">Facebook Support</a></li>
              ) : (
                <li><Link to="/" className="hover:text-white transition-colors">Help Center</Link></li>
              )}
              <li><Link to="/" className="hover:text-white transition-colors">DMCA</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-neutral-400">
              <li><Link to="/" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/" className="hover:text-white transition-colors">Cookie Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-neutral-500 text-xs">
            {settings?.footerText || `© ${new Date().getFullYear()} Deshi Hubx. All rights reserved.`}
          </p>
          <div className="flex gap-6 text-xs text-neutral-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Sitemap</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
