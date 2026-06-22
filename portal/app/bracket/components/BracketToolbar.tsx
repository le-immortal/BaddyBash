'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { Category } from '@/app/lib/models';
import { CATEGORIES } from '@/app/lib/models';

interface BracketToolbarProps {
  selectedCategory: Category;
  onCategoryChange: (category: Category) => void;
  matchesLength: number;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchStep: (direction: 'prev' | 'next') => void;
  searchResultCount: number;
  searchIndex: number;
}

export function BracketToolbar({
  selectedCategory,
  onCategoryChange,
  matchesLength,
  loading,
  searchQuery,
  onSearchChange,
  onSearchStep,
  searchResultCount,
  searchIndex,
}: BracketToolbarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-slate-900/95 backdrop-blur-sm">
      <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-lg mb-3 w-fit">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
              selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {matchesLength > 0 && !loading && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search player name or alias..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResultCount > 0) {
                e.preventDefault();
                onSearchStep(e.shiftKey ? 'prev' : 'next');
              }
            }}
            className="w-full pl-9 pr-9 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {searchQuery.trim() && searchResultCount > 0 && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchResultCount > 1 && (
                <>
                  <button
                    onClick={() => onSearchStep('prev')}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                    title="Previous result"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-slate-500 tabular-nums min-w-[3ch] text-center">
                    {searchIndex + 1}/{searchResultCount}
                  </span>
                  <button
                    onClick={() => onSearchStep('next')}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                    title="Next result"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {searchResultCount <= 1 && (
                <span className="text-xs text-slate-500">{searchResultCount} match</span>
              )}
            </div>
          )}
          {searchQuery.trim() && searchResultCount === 0 && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-red-400">No results</div>
          )}
        </div>
      )}
    </div>
  );
}
