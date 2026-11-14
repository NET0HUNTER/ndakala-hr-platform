import React from 'react';

export function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-[#4271b8] flex items-center justify-center overflow-hidden relative flex-shrink-0 rounded-sm shadow-sm">
        <div className="absolute w-12 h-2 bg-white transform rotate-45"></div>
      </div>
      <div className="flex flex-col justify-center leading-none mt-0.5 select-none">
        <span className={`text-sm font-black tracking-widest ${light ? 'text-slate-900' : 'text-white'}`}>
          NDAKALA
        </span>
        <span className={`text-sm font-light tracking-widest mt-1 ${light ? 'text-slate-600' : 'text-white'}`}>
          ADVISORY
        </span>
      </div>
    </div>
  );
}
