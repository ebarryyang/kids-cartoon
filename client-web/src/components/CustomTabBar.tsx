import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Medal, User } from 'lucide-react';

interface Props {
  current: number;
}

const CustomTabBar: React.FC<Props> = ({ current }) => {
  const list = [
    { path: '/', text: '乐园', icon: Home },
    { path: '/discover', text: '发现', icon: Compass },
    { path: '/honor', text: '荣誉', icon: Medal },
    { path: '/mine', text: '宝宝', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40"
         style={{ 
           paddingBottom: 'env(safe-area-inset-bottom)',
         }}>
      <div className="bg-white/90 backdrop-blur-lg border-t border-gray-100"
           style={{ boxShadow: '0 -4px 20px rgba(255, 209, 59, 0.15)' }}>
        <div className="max-w-md mx-auto flex justify-around items-center h-16">
          {list.map((item, index) => {
            const isActive = current === index;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center w-16 h-full transition-all"
              >
                <div className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-orange-100 scale-110' : ''
                }`}>
                  <item.icon 
                    className="w-6 h-6 transition-colors" 
                    style={{ 
                      color: isActive ? '#FF7D00' : '#9CA3AF',
                      strokeWidth: isActive ? 2.5 : 2,
                    }}
                  />
                </div>
                <span className={`text-xs mt-1 font-black transition-colors ${
                  isActive ? '' : 'text-gray-400'
                }`}
                style={{ color: isActive ? '#FF7D00' : '#9CA3AF' }}>
                  {item.text}
                </span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomTabBar;
