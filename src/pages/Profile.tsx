import { useAuth } from '../context/AuthContext';
import { User, Mail, Shield, Clock, Heart, History, LogOut, ChevronLeft, Crown, CreditCard, Check, X, Smartphone, Receipt } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useNavigate, Link } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs, orderBy, doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Video, SiteSettings } from '../types';
import VideoCard from '../components/VideoCard';
import { motion } from 'motion/react';
import AdRenderer from '../components/AdRenderer';
import CustomAdsSpot from '../components/CustomAdsSpot';

export default function Profile() {
  const { user, profile, isAdmin, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Video[]>([]);
  const [saved, setSaved] = useState<Video[]>([]);
  const [history, setHistory] = useState<Video[]>([]);
  const [activeTab, setActiveTab] = useState<'favorites' | 'saved' | 'history'>('favorites');
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  // Subscription Billing States
  const [showSubscriptionSection, setShowSubscriptionSection] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'none' | 'monthly' | 'yearly'>('none');
  const [checkoutPlan, setCheckoutPlan] = useState<'monthly' | 'yearly' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'card' | null>(null);
  
  // Payment Form States
  const [accountNumber, setAccountNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pin, setPin] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  
  // Progress Flow & Simulation
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3 | 4>(1); // 1: Method, 2: Details, 3: OTP/Verification, 4: Success
  const [isProcessing, setIsProcessing] = useState(false);

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
    // Auto Scroll and Highlight subscription section if '?subscribe=true' is in the URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribe') === 'true') {
      setShowSubscriptionSection(true);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      setTimeout(() => {
        const elem = document.getElementById('subscription-section');
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth' });
        }
      }, 500);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch Favorites
        const favRef = collection(db, 'users', user.uid, 'favorites');
        const favSnap = await getDocs(query(favRef, orderBy('likedAt', 'desc'), limit(30)));
        if (!favSnap.empty) {
          setFavorites(favSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        } else {
          setFavorites([]);
        }

        // 2. Fetch Saved
        const savedRef = collection(db, 'users', user.uid, 'saved');
        const savedSnap = await getDocs(query(savedRef, orderBy('savedAt', 'desc'), limit(30)));
        if (!savedSnap.empty) {
          setSaved(savedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        } else {
          setSaved([]);
        }

        // 3. Fetch Watch History
        const histRef = collection(db, 'users', user.uid, 'history');
        const histSnap = await getDocs(query(histRef, orderBy('lastWatched', 'desc'), limit(30)));
        if (!histSnap.empty) {
          setHistory(histSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        } else {
          setHistory([]);
        }

      } catch (error) {
        console.error("Error fetching profile data from Firestore:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  const handleClearHistory = async () => {
    if (!user) return;
    if (window.confirm("আপনি কি নিশ্চিত যে আপনার ওয়াচ হিস্ট্রি মুছে ফেলতে চান? (Clear Watch History?)")) {
      try {
        const histRef = collection(db, 'users', user.uid, 'history');
        const snap = await getDocs(histRef);
        const deletePromises = snap.docs.map(d => deleteDoc(doc(db, 'users', user.uid, 'history', d.id)));
        await Promise.all(deletePromises);
        setHistory([]);
      } catch (error) {
        console.error("Error clearing history:", error);
      }
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  const handleOpenCheckout = (plan: 'monthly' | 'yearly') => {
    setCheckoutPlan(plan);
    setPaymentMethod(null);
    setCheckoutStep(1);
    setAccountNumber('');
    setVerificationCode('');
    setPin('');
    setCardName('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setIsProcessing(false);
  };

  const handleSelectMethod = (method: 'bkash' | 'nagad' | 'rocket' | 'card') => {
    setPaymentMethod(method);
    setCheckoutStep(2);
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'card') {
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        setCheckoutStep(4);
        completeSubscription();
      }, 2000);
    } else {
      setCheckoutStep(3); // OTP / verification code step for mobile banking
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setCheckoutStep(4);
      completeSubscription();
    }, 2000);
  };

  const completeSubscription = async () => {
    if (!checkoutPlan) return;
    try {
      const expirationTime = checkoutPlan === 'monthly' 
        ? Date.now() + 30 * 24 * 60 * 60 * 1000 
        : Date.now() + 365 * 24 * 60 * 60 * 1000;

      await updateProfile({
        subscriptionType: checkoutPlan,
        subscriptionExpiresAt: expirationTime,
      });
    } catch (err) {
      console.error("Error updating user subscription:", err);
    }
  };

  const handleCancelSubscription = async () => {
    if (window.confirm("আপনি কি নিশ্চিত যে আপনার প্রিমিয়াম সাবস্ক্রিপশনটি বাতিল করতে চান?")) {
      try {
        await updateProfile({
          subscriptionType: 'none',
          subscriptionExpiresAt: 0,
        });
      } catch (err) {
        console.error("Error cancelling subscription:", err);
      }
    }
  };

  if (!user || !profile) return null;

  // Active check helper
  const isSubscribed = !!(
    profile.subscriptionType && 
    profile.subscriptionType !== 'none' && 
    (!profile.subscriptionExpiresAt || Date.now() < profile.subscriptionExpiresAt)
  );

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

      {/* Profile Header */}
      <section className="bg-neutral-900 border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          <div className="w-32 h-32 rounded-3xl bg-neutral-800 flex items-center justify-center overflow-hidden border-4 border-neutral-800 shadow-xl relative group">
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-neutral-600" />
            )}
            {isSubscribed && (
              <div className="absolute bottom-1 right-1 bg-purple-600 p-1.5 rounded-full border border-neutral-900 shadow-xl">
                <Crown className="w-3.5 h-3.5 text-white fill-current" />
              </div>
            )}
          </div>
          
          <div className="flex-1 text-center md:text-left space-y-4">
            <div>
              <div className="flex flex-col md:flex-row md:items-center gap-3 justify-center md:justify-start mb-2">
                <h1 className="text-4xl font-bold tracking-tight">{profile.name}</h1>
                {isSubscribed && (
                  <span className="self-center flex items-center gap-1 bg-purple-600/15 border border-purple-500/30 text-purple-400 font-black tracking-widest text-[9px] px-3 py-1 rounded-full uppercase">
                    <Crown className="w-3 h-3 fill-current" /> PREMIUM MEMBER
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-neutral-400">
                <div className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {profile.email}</div>
                <div className="flex items-center gap-1.5">
                  <Shield className={`w-4 h-4 ${isAdmin ? 'text-rose-500' : 'text-neutral-500'}`} /> 
                  {isAdmin ? 'Administrator' : isSubscribed ? 'Premium Member' : 'Standard Member'}
                </div>
                {isSubscribed && profile.subscriptionExpiresAt && (
                  <div className="flex items-center gap-1.5 text-purple-400 font-medium">
                    <Clock className="w-4 h-4" /> 
                    মেয়াদ শেষ: {new Date(profile.subscriptionExpiresAt).toLocaleDateString('bn-BD')}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              {isAdmin && (
                <Link to="/admin" className="px-6 py-2 bg-rose-600 hover:bg-rose-700 rounded-full text-sm font-bold transition-all flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Admin Panel
                </Link>
              )}
              <button 
                onClick={() => navigate('/subscription')} 
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                  isSubscribed 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                }`}
              >
                <Crown className="w-4 h-4" /> 
                {isSubscribed ? 'মেম্বারশিপ প্যাকেজ (Membership Plan)' : 'প্রিমিয়াম কিনুন (Go Premium)'}
              </button>
              <button onClick={handleLogout} className="px-6 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 rounded-full text-sm font-bold transition-all flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Custom Extra Ads - Profile Top */}
      <CustomAdsSpot settings={siteSettings} placement="profile_top" />

      {/* Sponsored Native Add Spot */}
      {siteSettings?.adConfig?.enabled && siteSettings.adConfig.nativeBannerScript && (
        <div className="w-full">
          <div className="text-center text-[10px] text-neutral-500 mb-1 font-bold uppercase tracking-widest">Sponsored Native Add</div>
          <AdRenderer htmlCode={siteSettings.adConfig.nativeBannerScript} />
        </div>
      )}

      {/* Premium Subscription Billing & Pricing Section */}
      {showSubscriptionSection && (
        <>
      <section id="subscription-section" className="bg-neutral-900/50 border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden space-y-8">
        <div className="absolute top-0 left-0 w-64 h-64 bg-purple-600/5 blur-3xl rounded-full -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        
        <div className="text-center space-y-2 relative z-10">
          <h2 className="text-3xl font-black text-white flex items-center justify-center gap-2">
            <Crown className="w-7 h-7 text-purple-500 fill-current" />
            মেম্বারশিপ প্যাকেজ সমূহ (Membership Plans)
          </h2>
          <p className="text-xs md:text-sm text-neutral-400 max-w-xl mx-auto">
            প্রিমিয়াম ভিডিও দেখতে এবং ঝামেলামুক্ত সম্পূর্ণ অ্যাড-ফ্রি স্ট্রিমিং অভিজ্ঞতা উপভোগ করতে আজই আপনার পছন্দের প্যাকেজটি সাবস্ক্রাইব করুন।
          </p>
        </div>

        {/* Subscription Plan Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {/* Free Standard Plan */}
          <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 flex flex-col justify-between hover:border-white/10 transition-all">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-300">ফ্রি মেম্বারশিপ (Free Plan)</h3>
                <p className="text-xs text-neutral-500 mt-1">সব সাধারণ ক্যাটাগরির ভিডিও দেখার জন্য</p>
              </div>
              <div className="flex items-baseline gap-1 text-white">
                <span className="text-3xl font-extrabold">০ ৳</span>
                <span className="text-xs text-neutral-500">/ চিরকাল</span>
              </div>
              <div className="border-t border-white/5 pt-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> standard movies & clips
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> ad sponsor gate enabled
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 line-through">
                  <X className="w-4 h-4 text-rose-500/50 flex-shrink-0" /> premium movies access
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 line-through">
                  <X className="w-4 h-4 text-rose-500/50 flex-shrink-0" /> ad-free streaming option
                </div>
              </div>
            </div>
            <button 
              disabled={!isSubscribed}
              className={`w-full py-3 mt-6 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
                !isSubscribed 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                  : 'bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/20'
              }`}
              onClick={handleCancelSubscription}
            >
              {!isSubscribed ? 'Active Plan' : 'Downgrade Plan'}
            </button>
          </div>

          {/* Monthly Premium Plan */}
          <div className="bg-neutral-900 border-2 border-purple-600 rounded-2xl p-6 flex flex-col justify-between hover:border-purple-500 transition-all relative transform md:-translate-y-2 shadow-xl shadow-purple-600/5">
            <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-purple-600 text-white font-black text-[9px] px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">
              Popular Choice
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                  মাসিক প্রিমিয়াম (Monthly)
                </h3>
                <p className="text-xs text-neutral-400 mt-1">সবচেয়ে জনপ্রিয় এবং নমনীয় সাবস্ক্রিপশন প্ল্যান</p>
              </div>
              <div className="flex items-baseline gap-1 text-purple-400">
                <span className="text-4xl font-black">১৯৯ ৳</span>
                <span className="text-xs text-neutral-500">/ ১ মাস</span>
              </div>
              <div className="border-t border-white/5 pt-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <Check className="w-4 h-4 text-purple-500 flex-shrink-0" /> All premium movies unlocked
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <Check className="w-4 h-4 text-purple-500 flex-shrink-0" /> 100% ad-free experience
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <Check className="w-4 h-4 text-purple-500 flex-shrink-0" /> ultra high definition stream
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <Check className="w-4 h-4 text-purple-500 flex-shrink-0" /> 24/7 Priority chat support
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleOpenCheckout('monthly')}
              className={`w-full py-3.5 mt-6 rounded-xl text-xs font-black transition-all uppercase tracking-wider ${
                profile.subscriptionType === 'monthly' && isSubscribed
                  ? 'bg-purple-600 text-white border-none'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-600/20'
              }`}
            >
              {profile.subscriptionType === 'monthly' && isSubscribed ? 'Active Plan' : 'Subscribe Now'}
            </button>
          </div>

          {/* Yearly Premium Plan */}
          <div className="bg-neutral-900 border border-white/5 hover:border-purple-500/30 rounded-2xl p-6 flex flex-col justify-between transition-all">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-neutral-300">বাৎসরিক প্রিমিয়াম (Yearly)</h3>
                  <span className="bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-emerald-500/20">Save 37%</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">সবচেয়ে সাশ্রয়ী দীর্ঘমেয়াদী প্যাকেজ</p>
              </div>
              <div className="flex items-baseline gap-1 text-white">
                <span className="text-3xl font-extrabold">১৪৯৯ ৳</span>
                <span className="text-xs text-neutral-500">/ ১ বছর</span>
              </div>
              <div className="border-t border-white/5 pt-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> unlimited premium movies
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> VIP 100% ad-free stream
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> UHD/4K Video support
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> Dedicated vip accounts desk
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleOpenCheckout('yearly')}
              className={`w-full py-3 mt-6 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
                profile.subscriptionType === 'yearly' && isSubscribed
                  ? 'bg-purple-600 text-white border-none'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/5'
              }`}
            >
              {profile.subscriptionType === 'yearly' && isSubscribed ? 'Active Plan' : 'Subscribe Now'}
            </button>
          </div>
        </div>
      </section>

      {/* Interactive Gateway Payment Checkout Modal */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-lg">প্রিমিয়াম গেটওয়ে পেমেন্ট</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {checkoutPlan === 'monthly' ? 'মাসিক প্যাকেজ - ১৯৯ ৳' : 'বাৎসরিক প্যাকেজ - ১৪৯৯ ৳'}
                </p>
              </div>
              {checkoutStep !== 4 && (
                <button 
                  onClick={() => setCheckoutPlan(null)} 
                  className="p-1.5 hover:bg-white/5 rounded-full text-neutral-500 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Step 1: Select Payment Method */}
            {checkoutStep === 1 && (
              <div className="p-6 space-y-4">
                <p className="text-xs text-neutral-400">অনুগ্রহ করে নিচের যেকোনো একটি পেমেন্ট পদ্ধতি সিলেক্ট করুন:</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* bKash */}
                  <button 
                    onClick={() => handleSelectMethod('bkash')}
                    className="flex flex-col items-center justify-center p-4 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/50 rounded-2xl transition-all gap-2 group"
                  >
                    <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center font-black text-rose-500 group-hover:scale-110 transition-transform text-sm">
                      bK
                    </div>
                    <span className="text-xs font-bold text-neutral-200">বিকাশ (bKash)</span>
                  </button>

                  {/* Nagad */}
                  <button 
                    onClick={() => handleSelectMethod('nagad')}
                    className="flex flex-col items-center justify-center p-4 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/50 rounded-2xl transition-all gap-2 group"
                  >
                    <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center font-black text-orange-500 group-hover:scale-110 transition-transform text-sm">
                      Na
                    </div>
                    <span className="text-xs font-bold text-neutral-200">নগদ (Nagad)</span>
                  </button>

                  {/* Rocket */}
                  <button 
                    onClick={() => handleSelectMethod('rocket')}
                    className="flex flex-col items-center justify-center p-4 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/50 rounded-2xl transition-all gap-2 group"
                  >
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center font-black text-indigo-500 group-hover:scale-110 transition-transform text-sm">
                      Ro
                    </div>
                    <span className="text-xs font-bold text-neutral-200">রকেট (Rocket)</span>
                  </button>

                  {/* Debit/Credit Card */}
                  <button 
                    onClick={() => handleSelectMethod('card')}
                    className="flex flex-col items-center justify-center p-4 bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/50 rounded-2xl transition-all gap-2 group"
                  >
                    <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center font-black text-purple-500 group-hover:scale-110 transition-transform text-sm">
                      <CreditCard className="w-5 h-5 text-purple-500" />
                    </div>
                    <span className="text-xs font-bold text-neutral-200">কার্ড (Card)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Payment Details */}
            {checkoutStep === 2 && paymentMethod && (
              <form onSubmit={handleDetailsSubmit} className="p-6 space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <div className={`px-3 py-1.5 rounded-full text-xs font-black uppercase text-white ${
                    paymentMethod === 'bkash' ? 'bg-rose-500' :
                    paymentMethod === 'nagad' ? 'bg-orange-500' :
                    paymentMethod === 'rocket' ? 'bg-indigo-500' : 'bg-purple-600'
                  }`}>
                    {paymentMethod}
                  </div>
                  <span className="text-xs text-neutral-400">পেমেন্ট গেটওয়ে অ্যাকাউন্ট বিবরণী</span>
                </div>

                {paymentMethod !== 'card' ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">মোবাইল নম্বর (Mobile Wallet No.)</label>
                      <input 
                        type="tel" 
                        required
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="e.g. 017XXXXXXXX"
                        maxLength={11}
                        className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white" 
                      />
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                      মোবাইল নম্বর দেওয়ার পর একটি ৬ সংখ্যার ভেরিফিকেশন কোড (OTP) পাঠানো হবে।
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">কার্ডধারীর নাম (Cardholder Name)</label>
                      <input 
                        type="text" 
                        required
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="e.g. Rahim Uddin"
                        className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">কার্ড নম্বর (Card Number)</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          required
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="xxxx xxxx xxxx xxxx"
                          maxLength={19}
                          className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white pl-10" 
                        />
                        <CreditCard className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">মেয়াদ (Expiry)</label>
                        <input 
                          type="text" 
                          required
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          maxLength={5}
                          className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white text-center" 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">CVC/CVV</label>
                        <input 
                          type="password" 
                          required
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          placeholder="***"
                          maxLength={3}
                          className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white text-center" 
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-white/5">
                  <button 
                    type="button" 
                    onClick={() => setCheckoutStep(1)} 
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-xl text-xs font-bold uppercase transition-all"
                  >
                    ফিরে যান
                  </button>
                  <button 
                    type="submit" 
                    disabled={isProcessing}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-lg shadow-purple-600/15"
                  >
                    {isProcessing ? 'পেমেন্ট হচ্ছে...' : 'পেমেন্ট এগিয়ে যান'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Mobile Banking Verification Code (OTP) */}
            {checkoutStep === 3 && paymentMethod && (
              <form onSubmit={handleOtpSubmit} className="p-6 space-y-4">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-purple-600/10 rounded-full flex items-center justify-center text-purple-500 mx-auto">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-white text-sm">ভেরিফিকেশন এবং সিকিউরিটি পিন</h4>
                  <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
                    আমরা <span className="text-purple-400 font-bold">{accountNumber}</span> নম্বরে একটি ওটিপি কোড পাঠিয়েছি। এটি যাচাই করুন।
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">ভেরিফিকেশন কোড (OTP)</label>
                      <input 
                        type="text" 
                        required
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="e.g. 123456"
                        maxLength={6}
                        className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white text-center font-mono tracking-widest" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">অ্যাকাউন্ট পিন (PIN)</label>
                      <input 
                        type="password" 
                        required
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="****"
                        maxLength={5}
                        className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-purple-500 text-sm text-white text-center tracking-widest" 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/5">
                  <button 
                    type="button" 
                    onClick={() => setCheckoutStep(2)} 
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-xl text-xs font-bold uppercase transition-all"
                  >
                    ফিরে যান
                  </button>
                  <button 
                    type="submit" 
                    disabled={isProcessing}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-lg shadow-purple-600/15"
                  >
                    {isProcessing ? 'যাচাই করা হচ্ছে...' : 'পেমেন্ট নিশ্চিত করুন'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 4: Success Message */}
            {checkoutStep === 4 && (
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto border-2 border-emerald-500/20 animate-scaleIn">
                  <Check className="w-10 h-10 stroke-[3px]" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-white">পেমেন্ট সফল হয়েছে!</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                    অভিনন্দন! আপনার প্রিমিয়াম সাবস্ক্রিপশন মেম্বারশিপটি সফলভাবে অ্যাক্টিভেট করা হয়েছে। এখন আপনি কোনো অ্যাড ছাড়াই যেকোনো প্রিমিয়াম ভিডিও সরাসরি দেখতে পারবেন।
                  </p>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => {
                      setCheckoutPlan(null);
                      // Force refresh profile data
                      window.location.reload();
                    }}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20"
                  >
                    স্ট্রিমিং শুরু করুন (Start Streaming)
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
        </>
      )}

      {/* Interactive Tabs for Favorites, Saved, and Watch History */}
      <div className="space-y-6 pt-4">
        <div className="flex border-b border-white/5 pb-2 overflow-x-auto gap-4 scrollbar-none">
          <button 
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 pb-2 px-2 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === 'favorites' 
                ? 'border-rose-500 text-white font-black' 
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Heart className="w-4 h-4 text-rose-500 fill-current" />
            ফেভারিট ভিডিও (Favorites - {favorites.length})
          </button>

          <button 
            onClick={() => setActiveTab('saved')}
            className={`flex items-center gap-2 pb-2 px-2 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === 'saved' 
                ? 'border-purple-500 text-white font-black' 
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Crown className="w-4 h-4 text-purple-400 fill-current" />
            সেভ করা ভিডিও (Saved - {saved.length})
          </button>

          <button 
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 pb-2 px-2 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === 'history' 
                ? 'border-neutral-400 text-white font-black' 
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4 text-neutral-400" />
            ওয়াচ হিস্ট্রি (History - {history.length})
          </button>
        </div>

        {/* Tab Contents */}
        <div className="pt-2">
          {activeTab === 'favorites' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-current" />
                আপনার পছন্দের ভিডিওসমূহ (Your Favorite Videos)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {favorites.map(v => <VideoCard key={v.id} video={v} />)}
                {favorites.length === 0 && !loading && (
                  <div className="col-span-full py-16 text-center bg-neutral-900/50 rounded-2xl border border-dashed border-white/5 text-neutral-500 italic">
                    কোন ফেভারিট ভিডিও নেই। (No favorite videos yet)
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Crown className="w-5 h-5 text-purple-400 fill-current" />
                আপনার সেভ করা ভিডিওসমূহ (Your Saved Videos)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {saved.map(v => <VideoCard key={v.id} video={v} />)}
                {saved.length === 0 && !loading && (
                  <div className="col-span-full py-16 text-center bg-neutral-900/50 rounded-2xl border border-dashed border-white/5 text-neutral-500 italic">
                    কোন সেভ করা ভিডিও নেই। (No saved videos yet)
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <History className="w-5 h-5 text-neutral-400" />
                  ভিডিও দেখার ইতিহাস (Watch History)
                </h3>
                {history.length > 0 && (
                  <button 
                    onClick={handleClearHistory}
                    className="px-4 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold rounded-lg transition-colors border border-rose-500/20"
                  >
                    হিস্ট্রি মুছুন (Clear History)
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {history.map(v => <VideoCard key={v.id} video={v} />)}
                {history.length === 0 && !loading && (
                  <div className="col-span-full py-16 text-center bg-neutral-900/50 rounded-2xl border border-dashed border-white/5 text-neutral-500 italic">
                    হিস্ট্রি খালি রয়েছে। (Your watch history is empty)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
