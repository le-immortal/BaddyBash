'use client';
import { Category } from '../lib/models';
import { CheckCircle, Plus } from 'lucide-react';
import clsx from 'clsx';

interface RegistrationCardProps {
  category: { id: Category; name: string };
  status: 'available' | 'selected' | 'committed'; 
  partnerName?: string;
  partnerAlias?: string;
  partnerPhone?: string;
  onNameChange?: (val: string) => void;
  onAliasChange?: (val: string) => void;
  onPhoneChange?: (val: string) => void;
  disabled: boolean;
  onSelect: (catId: Category) => void;
  onDeselect: (catId: Category) => void;
}

export default function RegistrationCard({ 
  category, 
  status, 
  partnerName,
  partnerAlias, 
  partnerPhone,
  onNameChange,
  onAliasChange, 
  onPhoneChange,
  disabled, 
  onSelect, 
  onDeselect 
}: RegistrationCardProps) {
  const isDoubles = category.id !== 'MS' && category.id !== 'WS';

  const handleSelect = () => {
    onSelect(category.id);
  };

  return (
    <div className={clsx("border rounded-xl p-4 transition-all shadow-sm", 
      status === 'committed' ? "bg-green-50 border-green-200" : 
      status === 'selected' ? "bg-blue-50 border-blue-200" :
      "bg-white border-gray-200",
      status === 'available' && disabled && "opacity-50 cursor-not-allowed"
    )}>
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-lg text-slate-800">{category.name}</h3>
        {status === 'committed' ? (
          <CheckCircle className="w-6 h-6 text-green-600" />
        ) : status === 'selected' ? (
           <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>
        ) : (
          <div className="w-6 h-6 border-2 border-gray-200 rounded-full" />
        )}
      </div>

      <div className="space-y-3">
        {isDoubles && status === 'committed' && (partnerName || partnerAlias || partnerPhone) && (
          <div className="space-y-1 text-sm text-slate-600 bg-green-50/50 rounded-lg p-3 border border-green-100">
            <p className="text-xs font-medium text-slate-500 uppercase mb-1.5">Partner Details</p>
            {partnerName && <p><span className="font-medium text-slate-700">Name:</span> {partnerName}</p>}
            {partnerAlias && <p><span className="font-medium text-slate-700">Alias:</span> {partnerAlias}</p>}
            {partnerPhone && <p><span className="font-medium text-slate-700">Phone:</span> {partnerPhone}</p>}
          </div>
        )}

        {isDoubles && (status !== 'committed') && (status === 'selected' || !disabled) && (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Partner Name</label>
              <input 
                type="text" 
                placeholder="e.g., Jane Doe"
                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-slate-900 bg-white placeholder-slate-400"
                value={partnerName || ''}
                onChange={(e) => onNameChange?.(e.target.value)}
                disabled={status !== 'selected'} 
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Partner Alias</label>
              <input 
                type="text" 
                placeholder="e.g., v-john"
                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-slate-900 bg-white placeholder-slate-400"
                value={partnerAlias || ''}
                onChange={(e) => onAliasChange?.(e.target.value)}
                disabled={status !== 'selected'} 
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Partner Phone</label>
              <input 
                type="tel" 
                placeholder="e.g., +1 555-0199"
                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-slate-900 bg-white placeholder-slate-400"
                value={partnerPhone || ''}
                onChange={(e) => onPhoneChange?.(e.target.value)}
                disabled={status !== 'selected'} 
              />
            </div>
          </div>
        )}

        {status === 'committed' ? (
          <div className="text-sm text-green-700 font-medium flex items-center">
            <CheckCircle className="w-3 h-3 mr-1" /> Confirmed
          </div>
        ) : status === 'selected' ? (
           <button
             onClick={() => onDeselect(category.id)}
             className="w-full py-2 rounded-lg text-sm font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
           >
             Deselect
           </button>
        ) : (
          <button
            onClick={handleSelect}
            disabled={disabled}
            className={clsx("w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-colors",
              disabled 
                ? "bg-gray-100 text-gray-400" 
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            <Plus className="w-4 h-4" />
            <span>Select</span>
          </button>
        )}
      </div>
    </div>
  );
}
