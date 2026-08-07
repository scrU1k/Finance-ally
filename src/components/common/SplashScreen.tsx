import React, { useEffect, useState } from 'react';

export const SplashScreen: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    // Start fade out slightly before removing
    const fadeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 2200);

    const removeTimer = setTimeout(() => {
      setShouldRender(false);
    }, 2600);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0e0e0c] transition-opacity duration-500 ease-out select-none ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Central Glowing Squircle Logo */}
      <div className="relative w-28 h-28 flex items-center justify-center animate-in zoom-in-95 duration-700 ease-out">
        {/* Glow backdrop */}
        <div className="absolute inset-0 bg-brand-blue/30 rounded-[35%] blur-2xl animate-pulse duration-[3000ms]"></div>
        
        {/* Squircle logo */}
        <div className="relative w-24 h-24 bg-surface-card rounded-[35%] overflow-hidden border border-white/10 shadow-2xl p-0.5 z-10">
          <img
            src="/logo.png"
            alt="Finance-Ally Logo"
            className="w-full h-full object-cover rounded-[33%]"
          />
        </div>
      </div>

      {/* Slogan Text Below Logo */}
      <div className="text-center mt-8 px-6 space-y-2 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300 ease-out">
        <p className="text-sm sm:text-base font-display font-bold text-white/90 tracking-wide leading-relaxed">
          Know where every rupee goes.
        </p>
        <p className="text-[11px] sm:text-xs font-mono text-muted-custom tracking-wider uppercase opacity-80">
          Small habits. Big savings.
        </p>
      </div>
    </div>
  );
};
