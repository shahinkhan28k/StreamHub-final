import { doc, setDoc, collection, getDocs, deleteDoc, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';

export async function seedDatabase() {
  const videosRef = collection(db, 'videos');
  // Check for any published video to see if we need to seed
  const snapshot = await getDocs(query(videosRef, where('published', '==', true), limit(1)));
  
  if (!snapshot.empty) {
    console.log("Database already has videos. Skipping seed.");
    return;
  }

  const sampleVideos = [
    {
      title: "Neon City - Cyberpunk Atmosphere",
      description: "Explore the neon-lit streets of a futuristic city in this immersive cinematic experience. High definition visuals and ambient soundtrack.",
      thumbnail: "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      categoryId: "movies",
      views: 125400,
      duration: "09:56",
      createdAt: Date.now() - 86400000 * 2,
      featured: true,
      locked: false,
      published: true,
      tags: ["cyberpunk", "cinematic", "scifi"]
    },
    {
      title: "Great Mountain Peaks - 4K Drone Footage",
      description: "Breathtaking views of the world's most beautiful mountain ranges. Shot in 4K resolution with professional drone equipment.",
      thumbnail: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      categoryId: "tech",
      views: 89000,
      duration: "10:53",
      createdAt: Date.now() - 86400000 * 5,
      featured: false,
      locked: true,
      published: true,
      tags: ["nature", "drone", "4k"]
    },
    {
      title: "Urban Exploring - Abandoned Factory",
      description: "Join us as we explore a massive abandoned factory from the 1920s. Discover hidden artifacts and historical secrets.",
      thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      categoryId: "gaming",
      views: 45000,
      duration: "00:15",
      createdAt: Date.now() - 86400000,
      featured: false,
      locked: false,
      published: true,
      tags: ["exploration", "urban", "history"]
    },
    {
      title: "Premium Masterclass: Advanced Video Production",
      description: "Unlock professional techniques for high-end video editing and color grading. Available for premium members only.",
      thumbnail: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      categoryId: "education",
      views: 1200,
      duration: "15:20",
      createdAt: Date.now() - 3600000 * 12,
      featured: false,
      locked: false,
      isPremium: true,
      published: true,
      tags: ["education", "pro", "video"]
    }
  ];

  for (const video of sampleVideos) {
    const newDoc = doc(collection(db, 'videos'));
    await setDoc(newDoc, video);
  }

  console.log("Database seeded successfully!");
}
