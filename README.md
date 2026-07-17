# StreamHub - Premium Video Streaming Platform

StreamHub is a high-performance, responsive video streaming application built with React 19, Firebase, and Tailwind CSS.

## Features

- **Premium UI/UX**: Dark mode by default with glassmorphism and Framer Motion animations.
- **Video Player**: Custom HTML5 player with fullscreen, volume control, and progress tracking.
- **Locked Content Flow**: Configurable pre-play screen for specific videos to drive engagement or promotions.
- **Admin Dashboard**: Full control over video uploads, statistics, and site settings.
- **Authentication**: Firebase Auth supporting Email/Password and Google Login.
- **Search & Filter**: Real-time search with category-based filtering.
- **Responsive**: Fully optimized for mobile, tablet, and desktop.

## Getting Started

1. **Firebase Configuration**: The app is already pre-configured with Firebase.
2. **Initial Seed**: On first launch, the app will automatically seed sample videos if the database is empty.
3. **Admin Access**: To access the admin panel, you can update your user role to `admin` in the Firestore `users` collection.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion
- **Backend**: Firebase Firestore, Firebase Auth, Firebase Storage
- **Icons**: Lucide React
- **Forms**: React Hook Form

## Deployment

The app is ready for deployment to Cloud Run or any static hosting service. Ensure your Firestore security rules match the provided `firestore.rules`.
