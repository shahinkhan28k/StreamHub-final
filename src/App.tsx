import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { seedDatabase } from './lib/seed';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { SiteSettings } from './types';
import Home from './pages/Home';
import VideoDetail from './pages/VideoDetail';
import Search from './pages/Search';
import CategoryBrowse from './pages/CategoryBrowse';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import AdminDashboard from './pages/admin/AdminDashboard';
import VideoManagement from './pages/admin/VideoManagement';
import SiteSettingsPage from './pages/admin/SiteSettingsPage';
import UserManagement from './pages/admin/UserManagement';
import Subscription from './pages/Subscription';
import PaymentManagement from './pages/admin/PaymentManagement';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import FloatingSupport from './components/FloatingSupport';

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen bg-neutral-950 text-white">Loading...</div>;

  if (!user) return <Navigate to="/login" />;

  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" />;

  return <>{children}</>;
};

const AppContent = () => {
  const { profile } = useAuth();
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    // Seed database if empty (safe to call, checks itself)
    seedDatabase().catch(err => {
      if (err.code === 'permission-denied') {
        console.log("Seeding skipped: User is not authorized. This is expected for non-admin users.");
      } else {
        console.error("Seed error:", err);
      }
    });
  }, []);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSiteSettings(docSnap.data() as SiteSettings);
      }
    });
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    const isAdmin = profile?.role === 'admin';
    const scriptIds = ['ad-popunder', 'ad-socialbar', 'ad-popundertop', 'ad-socialbartop'];
    
    const removeExistingScripts = () => {
      scriptIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
      const customEls = document.querySelectorAll('[id^="ad-custom-"]');
      customEls.forEach(el => el.remove());
    };

    if (isAdmin || !siteSettings?.adConfig?.enabled) {
      removeExistingScripts();
      return;
    }

    const adConfig = siteSettings.adConfig;
    const scriptsToInject = [
      { id: 'ad-popunder', code: adConfig.popunderScript },
      { id: 'ad-socialbar', code: adConfig.socialBarScript },
      { id: 'ad-popundertop', code: adConfig.popunderTopScript },
      { id: 'ad-socialbartop', code: adConfig.socialBarTopScript }
    ];

    // Add enabled global custom ads
    if (adConfig.customAds && Array.isArray(adConfig.customAds)) {
      adConfig.customAds.forEach((ad: any) => {
        if (ad.placement === 'global' && ad.enabled && ad.code) {
          scriptsToInject.push({
            id: `ad-custom-${ad.id}`,
            code: ad.code
          });
        }
      });
    }

    scriptsToInject.forEach(({ id, code }) => {
      if (!code || document.getElementById(id)) return;

      const wrapper = document.createElement('div');
      wrapper.id = id;
      wrapper.style.display = 'none';

      try {
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(code, 'text/html');
        const nodes = [
          ...Array.from(parsedDoc.head.childNodes),
          ...Array.from(parsedDoc.body.childNodes)
        ];

        nodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName.toLowerCase() === 'script') {
              const newScript = document.createElement('script');
              Array.from(el.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
              });
              newScript.text = el.textContent || '';
              wrapper.appendChild(newScript);
            } else {
              const cloned = el.cloneNode(true);
              wrapper.appendChild(cloned);
            }
          } else if (node.nodeType === Node.TEXT_NODE) {
            wrapper.appendChild(document.createTextNode(node.textContent || ''));
          }
        });
      } catch (err) {
        const fallbackScript = document.createElement('script');
        fallbackScript.innerHTML = code;
        wrapper.appendChild(fallbackScript);
      }

      document.body.appendChild(wrapper);
    });

    return () => {
      removeExistingScripts();
    };
  }, [profile, siteSettings]);

  const isDarkMode = siteSettings?.featureToggles?.darkMode !== false;

  return (
    <Router>
      <div className={`min-h-screen w-full overflow-x-hidden relative selection:bg-rose-500 selection:text-white transition-colors duration-300 ${isDarkMode ? 'bg-neutral-950 text-white' : 'light-theme text-slate-900 bg-[#f8fafc]'}`}>
        <Navbar />
        <main className="pb-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/video/:id" element={<VideoDetail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/category/:id" element={<CategoryBrowse />} />
            <Route path="/category/:id/:subId" element={<CategoryBrowse />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/subscription" element={
              <ProtectedRoute>
                <Subscription />
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/videos" element={
              <ProtectedRoute adminOnly>
                <VideoManagement />
              </ProtectedRoute>
            } />
            <Route path="/admin/payments" element={
              <ProtectedRoute adminOnly>
                <PaymentManagement />
              </ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute adminOnly>
                <SiteSettingsPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute adminOnly>
                <UserManagement />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
        <Footer />
        <FloatingSupport />
      </div>
    </Router>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
