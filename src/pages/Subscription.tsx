import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Crown, Check, CreditCard, ChevronLeft, Copy, CheckCircle2, 
  Smartphone, Clock, ShieldCheck, AlertCircle, RefreshCw 
} from 'lucide-react';
import { db } from '../lib/firebase';
import { 
  doc, getDoc, collection, addDoc, query, where, getDocs, 
  onSnapshot, limit, orderBy 
} from 'firebase/firestore';
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
  createdAt: any;
  rejectedReason?: string;
}

export default function Subscription() {
  const { user, profile, isSubscribed } = useAuth();
  const navigate = useNavigate();

  // Settings & Statuses
  const [gatewaySettings, setGatewaySettings] = useState<PaymentSetting>({
    bkashNumber: '01700000000',
    bkashType: 'personal',
    nagadNumber: '01800000000',
    nagadType: 'personal',
    rocketNumber: '01900000000',
    rocketType: 'personal',
    monthlyPrice: 299,
    yearlyPrice: 2499,
    plans: []
  });
  const [latestRequest, setLatestRequest] = useState<SubscriptionRequest | null>(null);
  const [loading, setLoading] = useState(true);

  // Flow State
  const [selectedPlan, setSelectedPlan] = useState<string>('monthly');
  const [selectedMethod, setSelectedMethod] = useState<'bkash' | 'nagad' | 'rocket' | null>(null);
  const [copied, setCopied] = useState(false);

  // Form Fields
  const [senderNumber, setSenderNumber] = useState('');
  const [paidAmount, setPaidAmount] = useState('299');
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Sync amount when plan changes or settings load
  useEffect(() => {
    const plansList = gatewaySettings.plans || [];
    const activePlan = plansList.find(p => p.id === selectedPlan);
    if (activePlan) {
      setPaidAmount(activePlan.price.toString());
    } else {
      const defaultPrice = selectedPlan === 'monthly' ? (gatewaySettings.monthlyPrice || 299) : (gatewaySettings.yearlyPrice || 2499);
      setPaidAmount(defaultPrice.toString());
    }
  }, [selectedPlan, gatewaySettings]);

  // Load active subscription requests and gateway settings
  useEffect(() => {
    const fetchSettingsAndRequests = async () => {
      try {
        // Fetch gateway settings
        const settingsSnap = await getDoc(doc(db, 'settings', 'payment'));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() as PaymentSetting;
          
          // Seed fallback plans if empty
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
          
          // Select first available plan
          if (data.plans.length > 0) {
            setSelectedPlan(data.plans[0].id);
          }
        } else {
          // Default seeded settings fallback
          const defaultData: PaymentSetting = {
            bkashNumber: '01700000000',
            bkashType: 'personal',
            nagadNumber: '01800000000',
            nagadType: 'personal',
            rocketNumber: '01900000000',
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
          };
          setGatewaySettings(defaultData);
          setSelectedPlan('monthly');
        }

        // Fetch latest request for logged-in user
        if (user) {
          const reqsRef = collection(db, 'subscriptionRequests');
          const q = query(
            reqsRef, 
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          
          const unsubRequests = onSnapshot(q, (snap) => {
            if (!snap.empty) {
              const docData = snap.docs[0];
              setLatestRequest({ id: docData.id, ...docData.data() } as SubscriptionRequest);
            } else {
              setLatestRequest(null);
            }
            setLoading(false);
          }, (err) => {
            console.error("Subscription requests stream error:", err);
            setLoading(false);
          });

          return () => unsubRequests();
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading subscription settings:", err);
        setLoading(false);
      }
    };

    fetchSettingsAndRequests();
  }, [user]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login?redirect=subscription');
      return;
    }

    if (!selectedMethod) {
      setError('অনুগ্রহ করে একটি পেমেন্ট পদ্ধতি সিলেক্ট করুন।');
      return;
    }

    if (!senderNumber || senderNumber.length < 11) {
      setError('সঠিক ১১ সংখ্যার প্রেরক মোবাইল নম্বরটি দিন।');
      return;
    }

    if (!transactionId || transactionId.trim().length < 6) {
      setError('অনুগ্রহ করে সঠিক ট্রানজেকশন আইডিটি বসান।');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const activePlan = (gatewaySettings.plans || []).find(p => p.id === selectedPlan);
      const planName = activePlan ? activePlan.name : (selectedPlan === 'monthly' ? '১ মাস (1 Month)' : '১ বছর (1 Year)');
      const durationDays = activePlan ? activePlan.durationDays : (selectedPlan === 'monthly' ? 30 : 365);

      await addDoc(collection(db, 'subscriptionRequests'), {
        userId: user.uid,
        userName: profile?.name || user.displayName || 'Unnamed User',
        userEmail: user.email || '',
        plan: selectedPlan,
        planName,
        durationDays,
        amount: Number(paidAmount),
        paymentMethod: selectedMethod,
        transactionId: transactionId.trim().toUpperCase(),
        senderNumber: senderNumber.trim(),
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setSuccess(true);
      // Reset form
      setTransactionId('');
      setSenderNumber('');
    } catch (err: any) {
      console.error("Submission error:", err);
      setError('পেমেন্ট সাবমিট করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-neutral-400 gap-4">
        <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
        <p className="text-sm font-bold tracking-wide">তথ্য লোড করা হচ্ছে...</p>
      </div>
    );
  }

  const activeMethodNumber = selectedMethod === 'bkash' ? gatewaySettings.bkashNumber :
                             selectedMethod === 'nagad' ? gatewaySettings.nagadNumber :
                             selectedMethod === 'rocket' ? gatewaySettings.rocketNumber : '';

  const activeMethodType = selectedMethod === 'bkash' ? gatewaySettings.bkashType :
                           selectedMethod === 'nagad' ? gatewaySettings.nagadType :
                           selectedMethod === 'rocket' ? gatewaySettings.rocketType : 'personal';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 min-h-screen">
      {/* Back to Home Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-full text-xs font-bold text-neutral-300 hover:text-white transition-all shadow-xl"
        >
          <ChevronLeft className="w-4 h-4 text-rose-500" />
          <span>ফিরে যান (Back)</span>
        </button>
        
        <h1 className="text-xl font-black text-neutral-400 tracking-wider">PREMIUM GATEWAY</h1>
      </div>

      {/* User Premium Status Header */}
      {isSubscribed && (
        <div className="bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-neutral-900 border border-purple-500/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Crown className="w-8 h-8 fill-current" />
            </div>
            <div className="space-y-1 text-center md:text-left">
              <h2 className="text-xl md:text-2xl font-black text-white">প্রিমিয়াম সাবস্ক্রিপশন চালু আছে!</h2>
              <p className="text-xs text-purple-300">
                আপনি এখন যেকোনো প্রিমিয়াম কন্টেন্ট কোনো ধরণের অ্যাড ছাড়া হাই-স্পিড প্লেয়ারে দেখতে পারবেন।
              </p>
              {profile?.subscriptionExpiresAt && (
                <div className="flex items-center gap-1.5 text-neutral-400 text-xs mt-1.5 justify-center md:justify-start">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  মেয়াদ শেষ: <span className="text-purple-300 font-bold">{new Date(profile.subscriptionExpiresAt).toLocaleDateString('bn-BD')}</span>
                </div>
              )}
            </div>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-purple-600/20 whitespace-nowrap"
          >
            স্ট্রিমিং শুরু করুন
          </button>
        </div>
      )}

      {/* Pending / Verification Box */}
      {!isSubscribed && latestRequest && latestRequest.status === 'pending' && (
        <div className="bg-amber-950/20 border border-amber-500/20 rounded-3xl p-6 md:p-8 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-amber-400">পেমেন্ট যাচাইকরণাধীন (Verification in Progress)</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                আপনার পেমেন্ট রিকোয়েস্টটি আমাদের সিস্টেমে সফলভাবে জমা রয়েছে। আমাদের অ্যাডমিন টিম ট্রানজেকশন আইডি যাচাই করে ২৪ ঘণ্টার মধ্যে প্রিমিয়াম মেম্বারশিপ অ্যাক্টিভেট করে দেবে।
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/5 text-xs font-medium">
            <div className="p-3 bg-neutral-900/60 rounded-2xl border border-white/5">
              <span className="text-neutral-500 block">প্যাকেজ (Plan)</span>
              <span className="text-white font-bold">{latestRequest.plan === 'monthly' ? 'মাসিক' : 'বাৎসরিক'}</span>
            </div>
            <div className="p-3 bg-neutral-900/60 rounded-2xl border border-white/5">
              <span className="text-neutral-500 block">টাকার পরিমাণ (Amount)</span>
              <span className="text-white font-bold">{latestRequest.amount} ৳</span>
            </div>
            <div className="p-3 bg-neutral-900/60 rounded-2xl border border-white/5">
              <span className="text-neutral-500 block">পদ্ধতি (Method)</span>
              <span className="text-white font-black uppercase">{latestRequest.paymentMethod}</span>
            </div>
            <div className="p-3 bg-neutral-900/60 rounded-2xl border border-white/5">
              <span className="text-neutral-500 block">ট্রানজেকশন আইডি (TxID)</span>
              <span className="text-amber-400 font-mono font-bold uppercase">{latestRequest.transactionId}</span>
            </div>
          </div>
        </div>
      )}

      {/* Rejected Alert (Allow retry) */}
      {!isSubscribed && latestRequest && latestRequest.status === 'rejected' && (
        <div className="bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 md:p-8 space-y-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 flex-shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-rose-500">পেমেন্ট রিজেক্ট করা হয়েছে! (Payment Rejected)</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                দুঃখিত, আপনার পূর্ববর্তী ট্রানজেকশন আইডিটি মেলেনি বা রিজেক্ট করা হয়েছে। অনুগ্রহ করে সঠিক পেমেন্ট বিবরণী দিয়ে পুনরায় রিকোয়েস্ট পাঠান।
              </p>
              {latestRequest.rejectedReason && (
                <p className="text-xs font-bold text-rose-400 mt-2">
                  কারণ: &quot;{latestRequest.rejectedReason}&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Purchase Checkout Section */}
      {(!isSubscribed && (!latestRequest || latestRequest.status !== 'pending')) && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
          
          {/* Left: Plan & Pricing Select */}
          <div className="md:col-span-2 space-y-4">
            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block pl-1">
              ১. প্যাকেজ নির্বাচন করুন (Select Plan)
            </span>

            {/* Dynamic Plans Mapping */}
            {(gatewaySettings.plans || []).map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`w-full text-left p-6 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? 'bg-purple-950/20 border-purple-500 shadow-xl shadow-purple-600/5'
                      : 'bg-neutral-900/60 border-white/5 hover:border-white/15'
                  }`}
                >
                  {plan.tag && (
                    <div className={`absolute top-3 right-3 text-white font-black text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-widest ${
                      plan.id === 'yearly' || plan.durationDays >= 365 ? 'bg-emerald-600' : 'bg-purple-600'
                    }`}>
                      {plan.tag}
                    </div>
                  )}
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-white">{plan.name}</h3>
                    <p className="text-xs text-neutral-400">মেয়াদ: {plan.durationDays} দিন (UHD ভিডিও স্ট্রিমিং)</p>
                  </div>
                  <div className="mt-6 flex items-baseline gap-1 text-purple-400">
                    <span className="text-3xl font-black">{plan.price} ৳</span>
                    <span className="text-xs text-neutral-500">/ {plan.name}</span>
                  </div>
                </button>
              );
            })}

            {/* Plan Perks Checklist */}
            <div className="p-5 bg-neutral-900/40 rounded-3xl border border-white/5 space-y-3">
              <span className="text-xs font-bold text-neutral-300 block">প্রিমিয়াম মেম্বারশিপের সুবিধাসমূহ:</span>
              <div className="space-y-2 text-xs text-neutral-400">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> সব প্রিমিয়াম ভিডিও আনলকড</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> ১০০% বিজ্ঞাপন-মুক্ত স্ট্রিমিং</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> আনলিমিটেড স্পিড প্লেয়ার বাফারহীন</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> ২৪/৭ প্রায়োরিটি চ্যাট সাপোর্ট</div>
              </div>
            </div>
          </div>

          {/* Right: Payment Method & Details */}
          <div className="md:col-span-3 space-y-6">
            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block pl-1">
              ২. পেমেন্ট করুন ও ট্রানজেকশন তথ্য দিন (Payment & Transfer)
            </span>

            {/* Gateway Methods selection */}
            <div className="grid grid-cols-3 gap-3">
              {/* bKash */}
              <button 
                type="button"
                onClick={() => setSelectedMethod('bkash')}
                className={`flex flex-col items-center justify-center p-4 border rounded-2xl transition-all gap-2 group relative overflow-hidden ${
                  selectedMethod === 'bkash'
                    ? 'bg-rose-950/20 border-rose-500'
                    : 'bg-neutral-900/50 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center font-black text-rose-500 group-hover:scale-105 transition-transform text-xs overflow-hidden">
                  {gatewaySettings.bkashLogo ? (
                    <img src={gatewaySettings.bkashLogo} alt="bKash" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    'bK'
                  )}
                </div>
                <span className="text-[11px] font-bold text-neutral-300">বিকাশ</span>
                {selectedMethod === 'bkash' && (
                  <div className="absolute top-1.5 right-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-rose-500" /></div>
                )}
              </button>

              {/* Nagad */}
              <button 
                type="button"
                onClick={() => setSelectedMethod('nagad')}
                className={`flex flex-col items-center justify-center p-4 border rounded-2xl transition-all gap-2 group relative overflow-hidden ${
                  selectedMethod === 'nagad'
                    ? 'bg-orange-950/20 border-orange-500'
                    : 'bg-neutral-900/50 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center font-black text-orange-500 group-hover:scale-105 transition-transform text-xs overflow-hidden">
                  {gatewaySettings.nagadLogo ? (
                    <img src={gatewaySettings.nagadLogo} alt="Nagad" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    'Ng'
                  )}
                </div>
                <span className="text-[11px] font-bold text-neutral-300">নগদ</span>
                {selectedMethod === 'nagad' && (
                  <div className="absolute top-1.5 right-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-orange-500" /></div>
                )}
              </button>

              {/* Rocket */}
              <button 
                type="button"
                onClick={() => setSelectedMethod('rocket')}
                className={`flex flex-col items-center justify-center p-4 border rounded-2xl transition-all gap-2 group relative overflow-hidden ${
                  selectedMethod === 'rocket'
                    ? 'bg-indigo-950/20 border-indigo-500'
                    : 'bg-neutral-900/50 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center font-black text-indigo-500 group-hover:scale-105 transition-transform text-xs overflow-hidden">
                  {gatewaySettings.rocketLogo ? (
                    <img src={gatewaySettings.rocketLogo} alt="Rocket" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    'Rk'
                  )}
                </div>
                <span className="text-[11px] font-bold text-neutral-300">রকেট</span>
                {selectedMethod === 'rocket' && (
                  <div className="absolute top-1.5 right-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /></div>
                )}
              </button>
            </div>

            {/* Render Guidelines & Phone details for Selected Method */}
            <AnimatePresence mode="wait">
              {selectedMethod ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Step Guidelines */}
                  <div className="bg-neutral-900/40 border border-white/5 p-5 rounded-3xl space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs text-rose-400 font-bold">স্টেপ ১: পেমেন্ট ট্রান্সফার নির্দেশাবলী</span>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        আপনার বিকাশ/নগদ/রকেট পার্সোনাল অ্যাকাউন্ট থেকে নিচের নাম্বারে কাঙ্ক্ষিত প্যাকেজের সমপরিমাণ টাকা <span className="font-bold text-white uppercase">{activeMethodType === 'agent' ? 'Cash Out (ক্যাশ আউট)' : 'Send Money (সেন্ড মানি)'}</span> করুন।
                      </p>
                    </div>

                    <div className="p-4 bg-neutral-950/80 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-black tracking-wider text-neutral-500">
                          {selectedMethod.toUpperCase()} {activeMethodType === 'agent' ? 'AGENT' : 'PERSONAL'} NUMBER
                        </span>
                        <span className="text-xl font-mono font-black text-white block select-all">
                          {activeMethodNumber}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(activeMethodNumber)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                          copied
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/5'
                        }`}
                      >
                        {copied ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>কপি হয়েছে!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>নাম্বার কপি</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit Confirmation Details Form */}
                  <form onSubmit={handleSubmitRequest} className="bg-neutral-900/60 border border-white/5 p-6 rounded-3xl space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs text-rose-400 font-bold">স্টেপ ২: পেমেন্ট ট্রানজেকশন ভেরিফিকেশন</span>
                      <p className="text-[11px] text-neutral-400">টাকা পাঠানোর পর নিচের ঘরগুলো সঠিক তথ্য দিয়ে পূরণ করে সাবমিট করুন।</p>
                    </div>

                    {/* Sender Mobile number */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">প্রেরকের মোবাইল নম্বর (Sender Mobile Wallet Number)</label>
                      <input
                        type="tel"
                        required
                        value={senderNumber}
                        onChange={(e) => setSenderNumber(e.target.value)}
                        placeholder="e.g. 017XXXXXXXX"
                        maxLength={11}
                        className="w-full bg-neutral-950 border border-white/5 focus:border-purple-500 focus:outline-none rounded-xl py-3 px-4 text-sm text-white font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Paid Amount */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">টাকার পরিমাণ (Paid Amount - ৳)</label>
                        <input
                          type="number"
                          required
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(e.target.value)}
                          className="w-full bg-neutral-950 border border-white/5 focus:border-purple-500 focus:outline-none rounded-xl py-3 px-4 text-sm text-white font-mono"
                        />
                      </div>

                      {/* Transaction ID */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">ট্রানজেকশন আইডি (Transaction ID - TxID)</label>
                        <input
                          type="text"
                          required
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          placeholder="e.g. AM39DN2X89"
                          className="w-full bg-neutral-950 border border-white/5 focus:border-purple-500 focus:outline-none rounded-xl py-3 px-4 text-sm text-white font-mono uppercase tracking-widest"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-500 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                      </div>
                    )}

                    {success ? (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
                          <CheckCircle2 className="w-5 h-5" />
                          <span>পেমেন্ট রিকোয়েস্ট জমা নেওয়া হয়েছে!</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-relaxed">
                          ধন্যবাদ! আপনার পেমেন্ট ভেরিফিকেশন তথ্যটি সফলভাবে সিস্টেমে পাঠানো হয়েছে। আমাদের টিম খুব শীঘ্রই এটি অনুমোদন করে দেবে।
                        </p>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2"
                      >
                        {submitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>সাবমিট করা হচ্ছে...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>পেমেন্ট তথ্য সাবমিট করুন</span>
                          </>
                        )}
                      </button>
                    )}
                  </form>
                </motion.div>
              ) : (
                <div className="p-12 text-center bg-neutral-900/20 border border-dashed border-white/5 rounded-3xl space-y-3">
                  <div className="w-12 h-12 bg-neutral-800/60 rounded-full flex items-center justify-center mx-auto text-neutral-600">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-neutral-500 max-w-xs mx-auto leading-relaxed">
                    অনুগ্রহ করে উপরে যেকোনো একটি মোবাইল ব্যাংকিং পেমেন্ট পদ্ধতি (বিকাশ/নগদ/রকেট) সিলেক্ট করুন।
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
