export type UserRole = 'user' | 'moderator' | 'admin';

export interface SubMenuItem {
  label: string;
  link: string;
}

export interface MenuItem {
  id: string;
  label: string;
  link: string;
  subMenus?: SubMenuItem[];
}

export interface CustomPlan {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  tag?: string;
  perks?: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  createdAt: number;
  subscriptionType?: string;
  subscriptionExpiresAt?: number;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  videoSourceType?: 'url' | 'embed';
  embedCode?: string;
  categoryId: string;
  subCategoryId?: string;
  views: number;
  duration: string;
  createdAt: number;
  featured: boolean;
  locked: boolean;
  adClicks: number;
  published: boolean;
  tags: string[];
  isPremium?: boolean;
  synced?: boolean;
}

export interface Comment {
  id: string;
  videoId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  createdAt: number;
}

export interface WatchHistory {
  id: string;
  userId: string;
  videoId: string;
  lastWatched: number;
  progress: number;
}

export interface Favorite {
  id: string;
  userId: string;
  videoId: string;
  createdAt: number;
}

export interface SiteSettings {
  siteName: string;
  logo?: string;
  primaryColor: string;
  footerText: string;
  contactEmail: string;
  socialLinks: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  supportConfig?: {
    telegramUrl?: string;
    facebookUrl?: string;
    showTelegramWidget?: boolean;
    widgetMessage?: string;
  };
  navigationMenu?: MenuItem[];
  mobileCategories?: string[];
  featureToggles: {
    lockedVideoScreen: boolean;
    darkMode: boolean;
  };
  adConfig: {
    enabled: boolean;
    directLink: string;
    socialBarScript: string;
    popunderScript: string;
    timerSeconds: number;
    popunderTopScript?: string;
    nativeBannerScript?: string;
    bannerScript?: string;
    smartlinkUrl?: string;
    socialBarTopScript?: string;
    showDirectLink?: boolean;
    showPromo1?: boolean;
    showPromo2?: boolean;
    showPromo3?: boolean;
    promoTitle1?: string;
    promoDesc1?: string;
    promoLink1?: string;
    promoIcon1?: string;
    promoTitle2?: string;
    promoDesc2?: string;
    promoLink2?: string;
    promoIcon2?: string;
    promoTitle3?: string;
    promoDesc3?: string;
    promoLink3?: string;
    promoIcon3?: string;
    customAds?: CustomAd[];
  };
}

export interface CustomAd {
  id: string;
  name: string;
  code: string;
  placement: 'global' | 'home_top' | 'home_bottom' | 'video_below_player' | 'video_sidebar' | 'category_top' | 'search_top' | 'profile_top';
  enabled: boolean;
}
