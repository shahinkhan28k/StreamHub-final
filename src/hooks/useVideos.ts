import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Video, Category } from '../types';

export const useVideos = (filters: QueryConstraint[] = []) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'videos'),
      where('published', '==', true),
      ...filters
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videoData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Video[];
      setVideos(videoData);
      setLoading(false);
    });

    return unsubscribe;
  }, [JSON.stringify(filters)]);

  return { videos, loading };
};

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const catData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      setCategories(catData);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { categories, loading };
};
