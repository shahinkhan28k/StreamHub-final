import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, User, Menu, X, Play, LogOut, LayoutDashboard, Settings, ChevronDown, ChevronUp, Crown, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { MenuItem } from '../types';

export default function Navbar() {
  const { user, profile, isAdmin, isSubscribed } = useAuth();
  const isLoggedIn = !!user || localStorage.getItem('deshi_hubx_logged_in') === 'true';
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [mobileCategories, setMobileCategories] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('Deshi Hubx');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.logo) {
          setLogoUrl(data.logo);
        } else {
          setLogoUrl('');
        }
        if (data.siteName) {
          setSiteName(data.siteName);
        }
        if (data.mobileCategories && data.mobileCategories.length > 0) {
          setMobileCategories(data.mobileCategories);
        } else {
          setMobileCategories([]);
        }
        if (data.navigationMenu && data.navigationMenu.length > 0) {
          setMenuItems(data.navigationMenu);
        } else {
          // Fallback to default menu items
          setMenuItems([
            { id: '1', label: 'Home', link: '/' },
            { id: '2', label: 'Movies', link: '/category/movies' },
            { id: '3', label: 'Sports', link: '/category/sports' },
            { id: '4', label: 'Gaming', link: '/category/gaming' }
          ]);
        }
      } else {
        setLogoUrl('');
        setSiteName('Deshi Hubx');
        setMenuItems([
          { id: '1', label: 'Home', link: '/' },
          { id: '2', label: 'Movies', link: '/category/movies' },
          { id: '3', label: 'Sports', link: '/category/sports' },
          { id: '4', label: 'Gaming', link: '/category/gaming' }
        ]);
      }
    });
    return () => unsub();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setIsOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('deshi_hubx_logged_in');
    } catch (e) {}
    await auth.signOut();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2">
                {logoUrl ? (
                  <img src={logoUrl} alt={siteName} className="h-8 max-h-8 object-contain rounded-lg" style={{ minWidth: '32px' }} />
                ) : (
                  <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-current" />
                  </div>
                )}
                <span className="text-xl font-bold tracking-tight">{siteName}</span>
              </Link>
              {isAdmin ? (
                <Link 
                  to="/admin/videos?upload=true"
                  className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-[11px] font-black px-3.5 py-1.5 rounded-full transition-all border border-purple-500/30 shadow-lg shadow-purple-600/15 active:scale-95 whitespace-nowrap"
                  title="ভিডিও আপলোড করুন"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>আপলোড ভিডিও (Upload Video)</span>
                </Link>
              ) : isLoggedIn ? (
                <div className="hidden sm:flex items-center gap-1.5 max-w-[280px] md:max-w-[400px] overflow-x-auto scrollbar-none whitespace-nowrap">
                  {(mobileCategories.length > 0 
                    ? mobileCategories 
                    : menuItems.filter(item => item.label !== 'Home').slice(0, 3).map(item => item.label)
                  ).map((catName, idx) => {
                    const matchedMenu = menuItems.find(item => item.label === catName);
                    const link = matchedMenu ? matchedMenu.link : `/category/${catName.toLowerCase().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-')}`;
                    return (
                      <Link
                        key={idx}
                        to={link}
                        className="text-[10px] font-black px-2.5 py-1 bg-neutral-900 hover:bg-neutral-850 border border-white/5 rounded-full text-neutral-300 hover:text-white transition-all"
                      >
                        {catName}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-400">
              {menuItems.map((item) => (
                <div 
                  key={item.id} 
                  className="relative group"
                  onMouseEnter={() => item.subMenus && item.subMenus.length > 0 && setActiveDropdown(item.id)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <Link 
                    to={item.link} 
                    className="hover:text-white transition-colors flex items-center gap-1 py-2"
                  >
                    {item.label}
                    {item.subMenus && item.subMenus.length > 0 && (
                      <ChevronDown className="w-3.5 h-3.5 opacity-75 group-hover:rotate-180 transition-transform duration-200" />
                    )}
                  </Link>

                  {item.subMenus && item.subMenus.length > 0 && activeDropdown === item.id && (
                    <div className="absolute left-0 mt-0 w-48 rounded-xl bg-neutral-900/95 border border-white/10 p-2 shadow-xl backdrop-blur-md z-50">
                      {item.subMenus.map((sub, idx) => (
                        <Link
                          key={idx}
                          to={sub.link}
                          className="block px-3 py-2 text-xs text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Search videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-neutral-900 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-rose-500 transition-colors w-64"
              />
            </form>

            {user ? (
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <Link to="/admin" className="p-2 hover:bg-white/5 rounded-full transition-colors text-neutral-400 hover:text-white">
                    <LayoutDashboard className="w-5 h-5" />
                  </Link>
                )}
                <Link to="/profile" className="flex items-center gap-2 p-1 pl-1 pr-3 hover:bg-white/5 rounded-full transition-colors">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden relative">
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-neutral-500" />
                    )}
                  </div>
                  <span className="text-sm font-medium flex items-center gap-1">
                    {profile?.name}
                    {isSubscribed && (
                      <Crown className="w-3.5 h-3.5 text-purple-400 fill-current animate-pulse" title="Premium Subscriber" />
                    )}
                  </span>
                </Link>
                <button onClick={handleLogout} className="p-2 hover:bg-white/5 rounded-full transition-colors text-neutral-400 hover:text-white">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="px-4 py-2 text-sm font-medium hover:text-rose-500 transition-colors">Login</Link>
                <Link to="/signup" className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 rounded-full transition-colors">Sign Up</Link>
              </div>
            )}
          </div>

          <div className="md:hidden flex items-center gap-4">
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-neutral-400">
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-white/5 bg-neutral-950 overflow-hidden"
          >
            <div className="px-4 py-6 space-y-4">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm"
                />
              </form>
              <div className="flex flex-col gap-2">
                {menuItems.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Link 
                        to={item.link} 
                        onClick={() => setIsOpen(false)} 
                        className="px-4 py-2 hover:bg-white/5 rounded-lg flex-1 text-left text-neutral-300 hover:text-white transition-all text-sm font-semibold"
                      >
                        {item.label}
                      </Link>
                      {item.subMenus && item.subMenus.length > 0 && (
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === item.id ? null : item.id)}
                          className="p-2 hover:bg-white/5 rounded-lg text-neutral-400"
                        >
                          {activeDropdown === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {item.subMenus && item.subMenus.length > 0 && activeDropdown === item.id && (
                      <div className="pl-6 space-y-1 border-l border-white/5 ml-4">
                        {item.subMenus.map((sub, idx) => (
                          <Link
                            key={idx}
                            to={sub.link}
                            onClick={() => setIsOpen(false)}
                            className="block px-4 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-white/5">
                {user ? (
                  <div className="flex flex-col gap-2">
                    <Link to="/profile" onClick={() => setIsOpen(false)} className="px-4 py-2 hover:bg-white/5 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5" /> Profile
                      </div>
                      {isSubscribed && (
                        <span className="flex items-center gap-1 bg-purple-600/15 border border-purple-500/30 text-purple-400 font-bold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                          <Crown className="w-2.5 h-2.5 fill-current animate-pulse" /> Premium
                        </span>
                      )}
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" onClick={() => setIsOpen(false)} className="px-4 py-2 hover:bg-white/5 rounded-lg flex items-center gap-3">
                        <LayoutDashboard className="w-5 h-5" /> Admin
                      </Link>
                    )}
                    <button onClick={handleLogout} className="px-4 py-2 hover:bg-white/5 rounded-lg flex items-center gap-3 text-left w-full">
                      <LogOut className="w-5 h-5" /> Logout
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/login" onClick={() => setIsOpen(false)} className="px-4 py-2 text-center bg-neutral-900 rounded-lg">Login</Link>
                    <Link to="/signup" onClick={() => setIsOpen(false)} className="px-4 py-2 text-center bg-rose-600 rounded-lg">Sign Up</Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile & Tablet Quick Categories Bar - Configured via Site Settings */}
      <div className="border-t border-white/5 bg-neutral-950/70 backdrop-blur-md py-2 overflow-x-auto scrollbar-none md:hidden">
        <div className="px-4 flex items-center gap-2 whitespace-nowrap">
          {(mobileCategories.length > 0 
            ? mobileCategories 
            : menuItems.filter(item => item.label !== 'Home').map(item => item.label)
          ).map((catName, idx) => {
            const matchedMenu = menuItems.find(item => item.label === catName);
            const link = matchedMenu ? matchedMenu.link : `/category/${catName.toLowerCase().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '-')}`;
            return (
              <Link
                key={idx}
                to={link}
                className="text-[11px] font-black px-3.5 py-1.5 rounded-full bg-neutral-900 border border-white/5 text-neutral-300 active:bg-rose-600 active:text-white hover:text-white transition-all active:scale-95"
              >
                {catName}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
