import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { User, Shield, ShieldAlert, ShieldCheck, Mail, Calendar, Search, MoreVertical, Check, X, ChevronLeft, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AdminSidebar from '../../components/AdminSidebar';

export default function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedUserForSub, setSelectedUserForSub] = useState<UserProfile | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string>('0');

  const getSubscriptionStatus = (u: UserProfile) => {
    if (!u.subscriptionType || u.subscriptionType === 'none') return null;
    const expiry = u.subscriptionExpiresAt ? Number(u.subscriptionExpiresAt) : 0;
    if (expiry && Date.now() > expiry) {
      return { active: false, label: `Expired on ${new Date(expiry).toLocaleDateString()}` };
    }
    return { active: true, label: `Active (Expires: ${new Date(expiry).toLocaleDateString()})` };
  };

  const handleSaveSubscription = async () => {
    if (!selectedUserForSub) return;
    try {
      const userRef = doc(db, 'users', selectedUserForSub.uid);
      const months = Number(selectedMonths);
      
      let updateFields: any = {};
      if (months === 0) {
        updateFields = {
          subscriptionType: 'none',
          subscriptionExpiresAt: 0
        };
      } else {
        const days = months * 30; // standard 30 days per month
        updateFields = {
          subscriptionType: months === 12 ? 'yearly' : 'monthly',
          subscriptionExpiresAt: Date.now() + days * 24 * 60 * 60 * 1000
        };
      }
      
      await updateDoc(userRef, updateFields);
      
      // Update local state
      setUsers(users.map(u => u.uid === selectedUserForSub.uid ? { ...u, ...updateFields } : u));
      setShowSubModal(false);
      setSelectedUserForSub(null);
    } catch (error) {
      console.error("Error updating subscription:", error);
      alert("Failed to update user subscription.");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (uid: string, newRole: 'user' | 'moderator' | 'admin') => {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { role: newRole });
      setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
      setEditingRole(null);
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update user role.");
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case 'moderator': return <ShieldCheck className="w-4 h-4 text-blue-500" />;
      default: return <User className="w-4 h-4 text-neutral-500" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'moderator': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-neutral-800 text-neutral-400 border-white/5';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Elegant Sidebar */}
        <AdminSidebar />

        {/* Content Area */}
        <div className="flex-1 w-full space-y-6">
          {/* Back Button */}
          <div className="flex items-center">
            <button 
              onClick={() => navigate(-1)} 
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-full text-xs font-bold text-neutral-300 hover:text-white transition-all shadow-xl"
            >
              <ChevronLeft className="w-4 h-4 text-rose-500" />
              <span>ফিরে যান (Go Back)</span>
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900/40 p-6 rounded-3xl border border-white/5">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="text-neutral-400 mt-1">Manage user permissions and security roles</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-neutral-900 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-rose-500 transition-colors w-64 text-white"
                />
              </div>
              
              <select 
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-neutral-900 border border-white/10 rounded-full py-2 px-4 text-sm focus:outline-none focus:border-rose-500 transition-colors text-neutral-300"
              >
                <option value="all">All Roles</option>
                <option value="user">Users</option>
                <option value="moderator">Moderators</option>
                <option value="admin">Admins</option>
              </select>
            </div>
          </div>

          <div className="bg-neutral-900 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">User</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Email</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Role</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500">Joined</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8 h-20 bg-neutral-900" />
                  </tr>
                ))
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center overflow-hidden">
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-5 h-5 text-neutral-600" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{u.name}</span>
                          {(() => {
                            const status = getSubscriptionStatus(u);
                            if (status) {
                              return (
                                <span className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${
                                  status.active ? 'text-purple-400' : 'text-neutral-500'
                                }`}>
                                  <Crown className="w-3 h-3 fill-current" /> {status.label}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-neutral-400 text-sm">{u.email}</td>
                    <td className="px-6 py-4">
                      {editingRole === u.uid ? (
                        <div className="flex items-center gap-2">
                          <select 
                            defaultValue={u.role}
                            id={`role-select-${u.uid}`}
                            className="bg-neutral-800 border border-white/10 rounded-lg py-1 px-2 text-xs"
                          >
                            <option value="user">User</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button 
                            onClick={() => {
                              const select = document.getElementById(`role-select-${u.uid}`) as HTMLSelectElement;
                              updateUserRole(u.uid, select.value as any);
                            }}
                            className="p-1 hover:bg-green-500/20 text-green-500 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingRole(null)}
                            className="p-1 hover:bg-rose-500/20 text-rose-500 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getRoleBadgeColor(u.role)}`}>
                          {getRoleIcon(u.role)}
                          {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-neutral-400 text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button 
                        onClick={() => {
                          setSelectedUserForSub(u);
                          let currentMonths = '1';
                          if (u.subscriptionType && u.subscriptionType !== 'none' && u.subscriptionExpiresAt) {
                            const diffMs = u.subscriptionExpiresAt - Date.now();
                            const diffDays = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
                            const approxMonths = Math.max(1, Math.round(diffDays / 30));
                            currentMonths = String(approxMonths);
                          } else {
                            currentMonths = '0';
                          }
                          setSelectedMonths(currentMonths);
                          setShowSubModal(true);
                        }}
                        className="p-2 hover:bg-purple-600/20 rounded-lg text-purple-400 hover:text-purple-300 transition-colors"
                        title="সাবস্ক্রিপশন যোগ/ম্যানেজ করুন (Manage Subscription)"
                      >
                        <Crown className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingRole(u.uid)}
                        className="p-2 hover:bg-white/10 rounded-lg text-neutral-500 hover:text-white transition-colors"
                        title="রোল এডিট করুন (Edit Role)"
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                    No users found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage Subscription Modal */}
      <AnimatePresence>
        {showSubModal && selectedUserForSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowSubModal(false);
                setSelectedUserForSub(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden z-10 text-white"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Crown className="w-5 h-5 text-purple-400" />
                  সাবস্ক্রিপশন যোগ করুন (Manage Subscription)
                </h3>
                <button 
                  onClick={() => {
                    setShowSubModal(false);
                    setSelectedUserForSub(null);
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-3.5 bg-white/5 rounded-2xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/10 flex items-center justify-center text-purple-400 font-bold">
                    {selectedUserForSub.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">{selectedUserForSub.name}</h4>
                    <p className="text-xs text-neutral-400">{selectedUserForSub.email}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                    সাবস্ক্রিপশন মেয়াদ নির্বাচন করুন (Select Duration)
                  </label>
                  <select
                    value={selectedMonths}
                    onChange={(e) => setSelectedMonths(e.target.value)}
                    className="w-full bg-neutral-950 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                  >
                    <option value="0">কোন সাবস্ক্রিপশন নেই (No Subscription / None)</option>
                    <option value="1">১ মাস (1 Month - 30 Days)</option>
                    <option value="2">২ মাস (2 Months - 60 Days)</option>
                    <option value="3">৩ মাস (3 Months - 90 Days)</option>
                    <option value="4">৪ মাস (4 Months - 120 Days)</option>
                    <option value="5">৫ মাস (5 Months - 150 Days)</option>
                    <option value="6">৬ মাস (6 Months - 180 Days)</option>
                    <option value="7">৭ মাস (7 Months - 210 Days)</option>
                    <option value="8">৮ মাস (8 Months - 240 Days)</option>
                    <option value="9">৯ মাস (9 Months - 270 Days)</option>
                    <option value="10">১০ মাস (10 Months - 300 Days)</option>
                    <option value="11">১১ মাস (11 Months - 330 Days)</option>
                    <option value="12">১ বছর (1 Year - 365 Days)</option>
                  </select>
                </div>

                {selectedMonths !== '0' && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-xs text-purple-400 leading-relaxed">
                    সংরক্ষণ করার পর, এই ব্যবহারকারীর জন্য সাবস্ক্রিপশন একটিভ হবে এবং আজকের তারিখ থেকে আগামী {Number(selectedMonths) * 30} দিন পর্যন্ত প্রিমিয়াম অ্যাক্সেস বজায় থাকবে।
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowSubModal(false);
                      setSelectedUserForSub(null);
                    }}
                    className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl font-bold transition-all text-xs uppercase tracking-wider"
                  >
                    বাতিল (Cancel)
                  </button>
                  <button
                    onClick={handleSaveSubscription}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all text-xs uppercase tracking-wider shadow-lg shadow-purple-600/15"
                  >
                    সংরক্ষণ করুন (Save)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>
</div>
  );
}
