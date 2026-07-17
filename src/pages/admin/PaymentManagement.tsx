import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { 
  collection, doc, getDoc, setDoc, query, onSnapshot, 
  orderBy, updateDoc, writeBatch 
} from 'firebase/firestore';
import { 
  Check, X, CreditCard, ShieldCheck, RefreshCw, AlertCircle, 
  Clock, CheckCircle, Ban, Phone, Settings, Filter, Search, User,
  Plus, Trash2
} from 'lucide-react';
import AdminSidebar from '../../components/AdminSidebar';
import { motion, AnimatePresence } from 'motion/react';

interface CustomPlan {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  tag?: string;
  perks?: string[];
}

interface PaymentSetting {
  bkashNumber: string;
  bkashType: 'personal' | 'agent';
  bkashLogo?: string;
  nagadNumber: string;
  nagadType: 'personal' | 'agent';
  nagadLogo?: string;
  rocketNumber: string;
  rocketType: 'personal' | 'agent';
  rocketLogo?: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  plans?: CustomPlan[];
}

interface SubscriptionRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  plan: string;
  planName?: string;
  durationDays?: number;
  amount: number;
  paymentMethod: 'bkash' | 'nagad' | 'rocket';
  transactionId: string;
  senderNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  rejectedReason?: string;
}

export default function PaymentManagement() {
  // Gateway Settings
  const [gatewaySettings, setGatewaySettings] = useState<PaymentSetting>({
    bkashNumber: '',
    bkashType: 'personal',
    nagadNumber: '',
    nagadType: 'personal',
    rocketNumber: '',
    rocketType: 'personal',
    monthlyPrice: 299,
    yearlyPrice: 2499
  });
  
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  // Requests list
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  
  // Filtering & searching
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Rejection handling modal state
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // New Subscription Plan States
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDuration, setNewPlanDuration] = useState<number>(30);
  const [newPlanPrice, setNewPlanPrice] = useState<number>(299);
  const [newPlanTag, setNewPlanTag] = useState('');

  const handleAddPlan = () => {
    if (!newPlanName.trim()) {
      alert('অনুগ্রহ করে প্ল্যানের নাম টাইপ করুন।');
      return;
    }
    if (newPlanDuration <= 0 || newPlanPrice <= 0) {
      alert('মেয়াদ এবং মূল্য অবশ্যই ০ থেকে বড় হতে হবে।');
      return;
    }
    
    const id = 'plan_' + Date.now().toString();
    const newPlan: CustomPlan = {
      id,
      name: newPlanName.trim(),
      durationDays: Number(newPlanDuration),
      price: Number(newPlanPrice),
      tag: newPlanTag.trim() || undefined
    };

    const currentPlans = gatewaySettings.plans || [];
    setGatewaySettings({
      ...gatewaySettings,
      plans: [...currentPlans, newPlan]
    });

    // Reset fields
    setNewPlanName('');
    setNewPlanDuration(30);
    setNewPlanPrice(299);
    setNewPlanTag('');
  };

  const handleRemovePlan = (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই প্ল্যানটি ডিলিট করতে চান?')) return;
    const currentPlans = gatewaySettings.plans || [];
    const updatedPlans = currentPlans.filter(p => p.id !== id);
    setGatewaySettings({
      ...gatewaySettings,
      plans: updatedPlans
    });
  };

  // Load gateway settings & subscription requests
  useEffect(() => {
    // 1. Get Payment Settings
    const loadSettings = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'payment'));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() as PaymentSetting;
          
          // Seed initial plans if they do not exist
          if (!data.plans || data.plans.length === 0) {
            data.plans = [
              {
                id: 'monthly',
                name: '১ মাস (1 Month)',
                durationDays: 30,
                price: data.monthlyPrice ?? 299,
                tag: 'জনপ্রিয়'
              },
              {
                id: 'yearly',
                name: '১ বছর (1 Year)',
                durationDays: 365,
                price: data.yearlyPrice ?? 2499,
                tag: 'সাশ্রয়ী ৩০%'
              }
            ];
          }
          setGatewaySettings(data);
        } else {
          // Initialize defaults
          setGatewaySettings({
            bkashNumber: '',
            bkashType: 'personal',
            nagadNumber: '',
            nagadType: 'personal',
            rocketNumber: '',
            rocketType: 'personal',
            monthlyPrice: 299,
            yearlyPrice: 2499,
            plans: [
              {
                id: 'monthly',
                name: '১ মাস (1 Month)',
                durationDays: 30,
                price: 299,
                tag: 'জনপ্রিয়'
              },
              {
                id: 'yearly',
                name: '১ বছর (1 Year)',
                durationDays: 365,
                price: 2499,
                tag: 'সাশ্রয়ী ৩০%'
              }
            ]
          });
        }
      } catch (err) {
        console.error("Error loading admin settings:", err);
      }
    };
    loadSettings();

    // 2. Stream Subscription Requests
    const q = query(
      collection(db, 'subscriptionRequests'),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const list: SubscriptionRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as SubscriptionRequest);
      });
      setRequests(list);
      setLoadingRequests(false);
    }, (err) => {
      console.error("Requests streaming error:", err);
      setLoadingRequests(false);
    });

    return () => unsub();
  }, []);

  // Save gateway configurations
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError('');
    setSettingsSuccess(false);

    try {
      await setDoc(doc(db, 'settings', 'payment'), gatewaySettings);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.error("Save settings error:", err);
      setSettingsError('গেটওয়ে সেটিংস সেভ করতে ব্যর্থ হয়েছে।');
    } finally {
      setSavingSettings(false);
    }
  };

  // Approve subscription request and activate Premium role
  const handleApproveRequest = async (request: SubscriptionRequest) => {
    if (!window.confirm(`${request.userName}-এর জন্য পেমেন্ট অনুমোদন করতে নিশ্চিত?`)) return;

    try {
      const batch = writeBatch(db);

      // 1. Update request status to approved
      const reqRef = doc(db, 'subscriptionRequests', request.id);
      batch.update(reqRef, { status: 'approved' });

      // 2. Compute subscription expiration timestamp
      let durationDays = request.durationDays;
      if (!durationDays) {
        if (request.plan === 'monthly') {
          durationDays = 30;
        } else if (request.plan === 'yearly') {
          durationDays = 365;
        } else {
          // If it's a custom plan, let's try to match it in current gateway settings or default to 30 days
          const matchedPlan = (gatewaySettings.plans || []).find(p => p.id === request.plan);
          durationDays = matchedPlan ? matchedPlan.durationDays : 30;
        }
      }
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + durationDays);

      // 3. Update user profile to premium member
      const userRef = doc(db, 'users', request.userId);
      batch.update(userRef, {
        isPremium: true,
        hasPremiumAccess: true,
        subscriptionType: request.plan,
        subscriptionExpiresAt: expiryDate.getTime()
      });

      await batch.commit();
      alert('পেমেন্ট রিকোয়েস্ট অনুমোদিত হয়েছে এবং প্রিমিয়াম মেম্বারশিপ অ্যাক্টিভেট হয়েছে!');
    } catch (err) {
      console.error("Approve error:", err);
      alert('অনুমোদন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    }
  };

  // Reject subscription request
  const handleRejectRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRequestId) return;
    if (!rejectReason.trim()) {
      alert('বাতিল করার কারণ উল্লেখ করুন।');
      return;
    }

    setSubmittingReject(true);

    try {
      const reqRef = doc(db, 'subscriptionRequests', rejectingRequestId);
      await updateDoc(reqRef, {
        status: 'rejected',
        rejectedReason: rejectReason.trim()
      });

      setRejectingRequestId(null);
      setRejectReason('');
      alert('পেমেন্ট রিকোয়েস্ট বাতিল করা হয়েছে।');
    } catch (err) {
      console.error("Reject error:", err);
      alert('বাতিলকরণ সম্পন্ন হয়নি।');
    } finally {
      setSubmittingReject(false);
    }
  };

  // Filter requests list
  const filteredRequests = requests.filter((req) => {
    const matchesTab = activeTab === 'all' || req.status === activeTab;
    
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term || 
      req.userName.toLowerCase().includes(term) ||
      req.userEmail.toLowerCase().includes(term) ||
      req.transactionId.toLowerCase().includes(term) ||
      req.senderNumber.includes(term);

    return matchesTab && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Admin Navigation Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <AdminSidebar />
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-8">
          
          {/* Title Area */}
          <div className="bg-neutral-900/40 p-6 rounded-3xl border border-white/5">
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
              Payment Gateway Control Panel
            </h1>
            <p className="text-neutral-400 text-xs mt-1 leading-relaxed">
              বিকাশ, নগদ ও রকেট গেটওয়ে পার্সোনাল/এজেন্ট নাম্বার সমূহ পরিবর্তন করুন এবং গ্রাহকদের পাঠানো পেমেন্ট রিকোয়েস্ট ম্যানুয়ালি যাচাই করে প্রিমিয়াম অ্যাকাউন্ট একটিভ করুন।
            </p>
          </div>

          {/* Form: Gateway Settings */}
          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 space-y-6 shadow-xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-rose-500" />
              ১. গেটওয়ে পেমেন্ট নাম্বার সমূহ (Gateway Wallet Accounts)
            </h2>

            <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* bKash configuration */}
              <div className="bg-neutral-950/60 p-4 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-white/5 text-rose-500">
                  <Phone className="w-4 h-4" />
                  <span className="text-xs font-black uppercase">বিকাশ গেটওয়ে (bKash)</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">বিকাশ নাম্বার (bKash Wallet Number)</label>
                    <input 
                      type="tel" 
                      required
                      value={gatewaySettings.bkashNumber}
                      onChange={(e) => setGatewaySettings({...gatewaySettings, bkashNumber: e.target.value})}
                      placeholder="e.g. 017XXXXXXXX"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">নাম্বারের ধরন (Wallet Type)</label>
                    <select 
                      value={gatewaySettings.bkashType}
                      onChange={(e: any) => setGatewaySettings({...gatewaySettings, bkashType: e.target.value})}
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-xs text-white"
                    >
                      <option value="personal">Personal (পার্সোনাল)</option>
                      <option value="agent">Agent (এজেন্ট)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">লোগো লিংক (Wallet Logo URL - Optional)</label>
                    <input 
                      type="url" 
                      value={gatewaySettings.bkashLogo || ''}
                      onChange={(e) => setGatewaySettings({...gatewaySettings, bkashLogo: e.target.value})}
                      placeholder="e.g. https://domain.com/bkash.png"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white"
                    />
                    {gatewaySettings.bkashLogo && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-neutral-500">প্রিভিউ:</span>
                        <img src={gatewaySettings.bkashLogo} alt="bKash" className="w-6 h-6 object-contain rounded bg-white/5 p-0.5" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Nagad configuration */}
              <div className="bg-neutral-950/60 p-4 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-white/5 text-orange-500">
                  <Phone className="w-4 h-4" />
                  <span className="text-xs font-black uppercase">নগদ গেটওয়ে (Nagad)</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">নগদ নাম্বার (Nagad Wallet Number)</label>
                    <input 
                      type="tel" 
                      required
                      value={gatewaySettings.nagadNumber}
                      onChange={(e) => setGatewaySettings({...gatewaySettings, nagadNumber: e.target.value})}
                      placeholder="e.g. 018XXXXXXXX"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">নাম্বারের ধরন (Wallet Type)</label>
                    <select 
                      value={gatewaySettings.nagadType}
                      onChange={(e: any) => setGatewaySettings({...gatewaySettings, nagadType: e.target.value})}
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-xs text-white"
                    >
                      <option value="personal">Personal (পার্সোনাল)</option>
                      <option value="agent">Agent (এজেন্ট)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">লোগো লিংক (Wallet Logo URL - Optional)</label>
                    <input 
                      type="url" 
                      value={gatewaySettings.nagadLogo || ''}
                      onChange={(e) => setGatewaySettings({...gatewaySettings, nagadLogo: e.target.value})}
                      placeholder="e.g. https://domain.com/nagad.png"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white"
                    />
                    {gatewaySettings.nagadLogo && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-neutral-500">প্রিভিউ:</span>
                        <img src={gatewaySettings.nagadLogo} alt="Nagad" className="w-6 h-6 object-contain rounded bg-white/5 p-0.5" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rocket configuration */}
              <div className="bg-neutral-950/60 p-4 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-white/5 text-indigo-500">
                  <Phone className="w-4 h-4" />
                  <span className="text-xs font-black uppercase">রকেট গেটওয়ে (Rocket)</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">রকেট নাম্বার (Rocket Wallet Number)</label>
                    <input 
                      type="tel" 
                      required
                      value={gatewaySettings.rocketNumber}
                      onChange={(e) => setGatewaySettings({...gatewaySettings, rocketNumber: e.target.value})}
                      placeholder="e.g. 019XXXXXXXX"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">নাম্বারের ধরন (Wallet Type)</label>
                    <select 
                      value={gatewaySettings.rocketType}
                      onChange={(e: any) => setGatewaySettings({...gatewaySettings, rocketType: e.target.value})}
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-xs text-white"
                    >
                      <option value="personal">Personal (পার্সোনাল)</option>
                      <option value="agent">Agent (এজেন্ট)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400">লোগো লিংক (Wallet Logo URL - Optional)</label>
                    <input 
                      type="url" 
                      value={gatewaySettings.rocketLogo || ''}
                      onChange={(e) => setGatewaySettings({...gatewaySettings, rocketLogo: e.target.value})}
                      placeholder="e.g. https://domain.com/rocket.png"
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white"
                    />
                    {gatewaySettings.rocketLogo && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-neutral-500">প্রিভিউ:</span>
                        <img src={gatewaySettings.rocketLogo} alt="Rocket" className="w-6 h-6 object-contain rounded bg-white/5 p-0.5" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pricing Plans settings */}
              <div className="col-span-full border-t border-white/5 pt-6 mt-4 space-y-4">
                <h3 className="text-sm font-bold text-neutral-300 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-500" />
                  ২. প্রিমিয়াম সাবস্ক্রিপশন প্যাকেজ ও প্ল্যান সমূহ (Manage Subscription Plans)
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  গ্রাহকদের জন্য বিভিন্ন মেয়াদের প্রিমিয়াম মেম্বারশিপ প্যাকেজ সমূহ তৈরি ও সংশোধন করুন। যেমন: ১ মাস, ২ মাস, ৩ মাস ইত্যাদি। এই প্ল্যানগুলো সরাসরি সাবস্ক্রিপশন কিনতে যাওয়ার পেজে গ্রাহকদের কার্ড আকারে প্রদর্শন করা হবে।
                </p>

                {/* Grid of existing plans */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                  {(gatewaySettings.plans || []).map((plan) => (
                    <div key={plan.id} className="bg-neutral-950/40 p-4 rounded-2xl border border-white/5 relative flex flex-col justify-between gap-3 group">
                      <div>
                        <div className="flex items-start justify-between">
                          <h4 className="text-xs font-bold text-neutral-200">{plan.name}</h4>
                          {plan.tag && (
                            <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-[9px] font-bold">
                              {plan.tag}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          <div className="text-[11px] text-neutral-400 flex justify-between">
                            <span>মেয়াদ:</span>
                            <span className="font-mono text-neutral-200">{plan.durationDays} দিন (Days)</span>
                          </div>
                          <div className="text-[11px] text-neutral-400 flex justify-between">
                            <span>প্যাকেজ মূল্য:</span>
                            <span className="font-mono font-bold text-rose-500">৳ {plan.price}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end border-t border-white/5 pt-2 mt-1">
                        <button
                          type="button"
                          onClick={() => handleRemovePlan(plan.id)}
                          className="text-neutral-500 hover:text-rose-500 p-1 rounded-lg transition-colors"
                          title="মুছে ফেলুন"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form to add a new custom plan */}
                <div className="bg-neutral-950/30 p-4 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-rose-500" />
                    নতুন সাবস্ক্রিপশন প্ল্যান যোগ করুন (Add Custom Plan)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400">প্ল্যানের নাম (Plan Title)</label>
                      <input 
                        type="text"
                        value={newPlanName}
                        onChange={(e) => setNewPlanName(e.target.value)}
                        placeholder="e.g. ২ মাস (2 Months)"
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400">মেয়াদ দিন হিসেবে (Duration Days)</label>
                      <input 
                        type="number"
                        value={newPlanDuration}
                        onChange={(e) => setNewPlanDuration(Number(e.target.value))}
                        placeholder="e.g. 60"
                        min={1}
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400">মূল্য টাকা হিসেবে (Price - ৳)</label>
                      <input 
                        type="number"
                        value={newPlanPrice}
                        onChange={(e) => setNewPlanPrice(Number(e.target.value))}
                        placeholder="e.g. 499"
                        min={1}
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400">ব্যাজ / ট্যাগ - অপশনাল (Badge Tag)</label>
                      <input 
                        type="text"
                        value={newPlanTag}
                        onChange={(e) => setNewPlanTag(e.target.value)}
                        placeholder="e.g. সেরা অফার"
                        className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2 px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddPlan}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white border border-white/5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 text-rose-500" />
                      <span>তালিকায় যোগ করুন (Add to List)</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="col-span-full flex items-center justify-between pt-4 border-t border-white/5">
                {settingsSuccess && (
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                    <Check className="w-4 h-4" /> গেটওয়ে সেটিংস সফলভাবে সেভ করা হয়েছে!
                  </span>
                )}
                {settingsError && (
                  <span className="text-rose-500 text-xs font-bold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> {settingsError}
                  </span>
                )}
                <div />

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                >
                  {savingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>সংরক্ষণ হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>পরিবর্তন সংরক্ষণ করুন (Save Settings)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Table: Subscription Verification Requests */}
          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-rose-500" />
                ২. মেম্বারশিপ যাচাইকরণ তালিকা (Subscription Verification List)
              </h2>

              {/* Search input field */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="TxID, নাম বা ফোন দিয়ে খুঁজুন..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-neutral-950 border border-white/5 rounded-full py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-rose-500 w-full sm:w-60"
                />
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Verification status Filter Tabs */}
            <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                    activeTab === tab
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/10'
                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-white/5'
                  }`}
                >
                  {tab === 'all' ? 'সব রিকোয়েস্ট' : 
                   tab === 'pending' ? 'অপেক্ষমান (Pending)' : 
                   tab === 'approved' ? 'অনুমোদিত (Approved)' : 'বাতিলকৃত (Rejected)'}
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-black/40 text-neutral-300 font-mono">
                    {tab === 'all' ? requests.length : requests.filter(r => r.status === tab).length}
                  </span>
                </button>
              ))}
            </div>

            {/* List Table Container */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-neutral-500 font-bold">
                    <th className="py-3 px-4">গ্রাহক (User)</th>
                    <th className="py-3 px-4">প্যাকেজ (Plan)</th>
                    <th className="py-3 px-4">পেমেন্ট পদ্ধতি ও ফোন</th>
                    <th className="py-3 px-4">ট্রানজেকশন আইডি (TxID)</th>
                    <th className="py-3 px-4">তারিখ (Date)</th>
                    <th className="py-3 px-4 text-center">অবস্থা (Status)</th>
                    <th className="py-3 px-4 text-right">পদক্ষেপ (Actions)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => (
                    <tr key={req.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4 space-y-1">
                        <span className="font-bold text-white block">{req.userName}</span>
                        <span className="text-neutral-500 block font-mono text-[10px]">{req.userEmail}</span>
                      </td>
                      <td className="py-4 px-4 font-bold text-neutral-300 uppercase">
                        {req.plan} ({req.amount} ৳)
                      </td>
                      <td className="py-4 px-4 space-y-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-white inline-block ${
                          req.paymentMethod === 'bkash' ? 'bg-rose-500' :
                          req.paymentMethod === 'nagad' ? 'bg-orange-500' : 'bg-indigo-500'
                        }`}>
                          {req.paymentMethod}
                        </span>
                        <span className="text-white font-mono block text-xs mt-1">{req.senderNumber}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-yellow-500 font-mono font-black uppercase text-sm tracking-wider select-all block bg-yellow-500/5 px-2.5 py-1 rounded-xl border border-yellow-500/10 w-fit">
                          {req.transactionId}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-neutral-500 font-mono">
                        {req.createdAt ? new Date(req.createdAt).toLocaleDateString('bn-BD') : ''}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          req.status === 'pending' ? 'bg-yellow-500/15 border border-yellow-500/20 text-yellow-500 animate-pulse' :
                          req.status === 'approved' ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400' :
                          'bg-rose-500/15 border border-rose-500/20 text-rose-500'
                        }`}>
                          {req.status === 'pending' ? 'অপেক্ষমান' : 
                           req.status === 'approved' ? 'অনুমোদিত' : 'বাতিলকৃত'}
                        </span>
                        {req.rejectedReason && (
                          <span className="text-[10px] text-rose-500 block mt-1 font-bold italic max-w-[150px] truncate mx-auto" title={req.rejectedReason}>
                            &quot;{req.rejectedReason}&quot;
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {req.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            {/* Approve */}
                            <button
                              onClick={() => handleApproveRequest(req)}
                              className="p-2 bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 text-emerald-400 hover:text-white rounded-full transition-all"
                              title="অনুমোদন করুন"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            {/* Reject */}
                            <button
                              onClick={() => setRejectingRequestId(req.id)}
                              className="p-2 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 text-rose-500 hover:text-white rounded-full transition-all"
                              title="বাতিল করুন"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-neutral-500 font-medium">সম্পূর্ণ (Completed)</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {filteredRequests.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-neutral-500 italic">
                        কোনো রিকোয়েস্ট পাওয়া যায়নি।
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* Reject Reason Modal Overlay */}
      {rejectingRequestId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">বাতিলকরণের কারণ লিখুন</h3>
              <button 
                onClick={() => setRejectingRequestId(null)}
                className="p-1.5 hover:bg-white/5 rounded-full text-neutral-500 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRejectRequestSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-neutral-400 font-bold uppercase block">বাতিলের স্পষ্ট কারণ (Rejection Reason)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. ট্রানজেকশন আইডি সঠিক নয় / পেমেন্ট পাওয়া যায়নি"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/5 focus:border-rose-500 focus:outline-none rounded-xl py-3 px-4 text-sm text-white"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setRejectingRequestId(null)}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-xl text-xs font-bold uppercase transition-all"
                >
                  ফিরে যান
                </button>
                <button
                  type="submit"
                  disabled={submittingReject}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-lg"
                >
                  {submittingReject ? 'বাতিল হচ্ছে...' : 'বাতিল নিশ্চিত করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
