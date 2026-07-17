import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Play, Settings as SettingsIcon, Users, 
  ArrowLeft, Globe, Megaphone, Home, HelpCircle, CreditCard 
} from 'lucide-react';

export default function AdminSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/admin',
      icon: LayoutDashboard,
      desc: 'System health & stats'
    },
    {
      label: 'Manage Videos',
      path: '/admin/videos',
      icon: Play,
      desc: 'Upload & lock streaming videos'
    },
    {
      label: 'Categories & Menus',
      path: '/admin/settings',
      icon: Globe,
      desc: 'Change category names & submenus'
    },
    {
      label: 'Payment Gateway',
      path: '/admin/payments',
      icon: CreditCard,
      desc: 'Gateway settings & subscription requests'
    },
    {
      label: 'Manage Users',
      path: '/admin/users',
      icon: Users,
      desc: 'System users & moderators'
    },
  ];

  return (
    <aside className="w-full lg:w-64 bg-neutral-900/60 border border-white/5 rounded-3xl p-6 flex flex-col justify-between h-auto lg:h-[calc(100vh-8rem)] sticky top-24 backdrop-blur-md">
      <div className="space-y-8">
        {/* Quick Back to Site */}
        <div>
          <Link 
            to="/" 
            className="flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-white transition-all bg-neutral-950/40 hover:bg-neutral-950 px-3 py-2 rounded-xl border border-white/5"
          >
            <ArrowLeft className="w-4 h-4 text-rose-500" />
            <span>মূল ওয়েবসাইট (Main Site)</span>
          </Link>
        </div>

        {/* Navigation List */}
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block pl-2">
            অ্যাডমিন প্যানেল (Admin Panel)
          </span>
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-start gap-3 p-3 rounded-2xl transition-all group ${
                    isActive 
                      ? 'bg-rose-600 text-white font-bold shadow-lg shadow-rose-600/15' 
                      : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-rose-500 transition-colors'}`} />
                  <div>
                    <span className="text-sm block">{item.label}</span>
                    <span className={`text-[10px] block font-medium leading-tight mt-0.5 ${isActive ? 'text-white/80' : 'text-neutral-500'}`}>
                      {item.desc}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-6 border-t border-white/5 hidden lg:block">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-rose-600/10 flex items-center justify-center text-rose-500">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] block text-neutral-400 font-bold">হেল্প লাইন (Support)</span>
            <span className="text-[10px] block text-neutral-500 font-medium">admin@streamhub.io</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
