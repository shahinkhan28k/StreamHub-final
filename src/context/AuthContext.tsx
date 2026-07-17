import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSubscribed: boolean;
  hasPremiumAccess: boolean;
  updateProfile: (updatedData: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSubscribed: false,
  hasPremiumAccess: false,
  updateProfile: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          localStorage.setItem('deshi_hubx_logged_in', 'true');
        } catch (e) {}
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          const isAdminEmail = firebaseUser.email === 'shahinkhan28ee@gmail.com';
          
          if (isAdminEmail && data.role !== 'admin') {
            await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
            data.role = 'admin';
          }
          
          setProfile(data);
        } else {
          // Create initial profile if it doesn't exist
          const isAdminEmail = firebaseUser.email === 'shahinkhan28ee@gmail.com';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            avatar: firebaseUser.photoURL || undefined,
            role: isAdminEmail ? 'admin' : 'user',
            createdAt: Date.now(),
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
        try {
          localStorage.removeItem('deshi_hubx_logged_in');
        } catch (e) {}
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setProfile(userDoc.data() as UserProfile);
      }
    }
  };

  const updateProfile = async (updatedData: Partial<UserProfile>) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, updatedData);
      setProfile((prev) => prev ? { ...prev, ...updatedData } as UserProfile : null);
    }
  };

  const getExpiryTimestamp = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = Date.parse(val);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const isSubscribed = !!(
    profile &&
    profile.subscriptionType &&
    profile.subscriptionType !== 'none' &&
    (!profile.subscriptionExpiresAt || Date.now() < getExpiryTimestamp(profile.subscriptionExpiresAt))
  );

  const hasPremiumAccess = profile?.role === 'admin' || isSubscribed;

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isSubscribed,
    hasPremiumAccess,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
