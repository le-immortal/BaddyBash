'use client';
import { useState } from 'react';
import { Category } from '../lib/models';
import { CheckCircle, ChevronDown, Plus } from 'lucide-react';
import clsx from 'clsx';

interface RegistrationCardProps {
  category: { id: Category; name: string };
  status: 'available' | 'selected' | 'committed'; 
  partnerName?: string;
  partnerAlias?: string;
  partnerPhone?: string;
  partnerTShirtSize?: string;
  onNameChange?: (val: string) => void;
  onAliasChange?: (val: string) => void;
  onPhoneChange?: (val: string) => void;
  onTShirtSizeChange?: (val: string) => void;
  disabled: boolean;
  onSelect: (catId: Category) => void;
  onDeselect: (catId: Category) => void;
  canWithdraw?: boolean;
  onWithdraw?: (catId: Category) => void;
}

export default function RegistrationCard({ 
  category, 
  status, 
  partnerName,
  partnerAlias, 
  partnerPhone,
  partnerTShirtSize,
  onNameChange,
  onAliasChange, 
  onPhoneChange,
  onTShirtSizeChange,
  disabled, 
  onSelect, 
  onDeselect,
  canWithdraw = false,
  onWithdraw
}: RegistrationCardProps) {
  const isDoubles = category.id !== 'MS' && category.id !== 'WS';
  const [partnerAliasWarning, setPartnerAliasWarning] = useState(false);
  const [partnerAliasGuideOpen, setPartnerAliasGuideOpen] = useState(false);

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
          <div className="flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
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
            {partnerTShirtSize && <p><span className="font-medium text-slate-700">Size:</span> {partnerTShirtSize}</p>}
          </div>
        )}

        {isDoubles && status === 'selected' && (
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
                placeholder="e.g., janedoe (from Teams profile)"
                className={`w-full mt-1 border rounded px-2 py-1 text-sm focus:outline-none text-slate-900 bg-white placeholder-slate-400 ${
                  partnerAliasWarning ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                }`}
                value={partnerAlias || ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (raw !== cleaned) {
                    setPartnerAliasWarning(true);
                    setTimeout(() => setPartnerAliasWarning(false), 4000);
                  }
                  onAliasChange?.(cleaned);
                }}
                disabled={status !== 'selected'} 
              />
              {partnerAliasWarning && (
                <p className="mt-0.5 text-[10px] text-red-500 font-medium">Only letters and numbers allowed. Use the short alias from your partner&apos;s Teams profile.</p>
              )}
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setPartnerAliasGuideOpen(prev => !prev)}
                  className="text-[10px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-200 ${partnerAliasGuideOpen ? 'rotate-180' : ''}`} />
                  {partnerAliasGuideOpen ? 'Hide guide' : 'Not sure which alias to use?'}
                </button>

                {partnerAliasGuideOpen && (
                  <div className="mt-1.5 p-2.5 bg-slate-800 rounded-lg text-white text-[10px] space-y-2">
                    <p className="text-slate-300">Open <span className="font-semibold text-white">Microsoft Teams</span> &rarr; Click your partner&rsquo;s profile &rarr; <span className="font-semibold text-white">Contact</span> tab &rarr; Look for &ldquo;Alias&rdquo;</p>

                    {/* Mini Teams Contact Mockup */}
                    <div className="bg-slate-900 rounded-md p-2.5 border border-slate-700">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">JD</div>
                        <div>
                          <p className="font-semibold text-xs text-white">Jane Doe</p>
                          <p className="text-[9px] text-slate-400">Software Engineer II</p>
                        </div>
                      </div>
                      <div className="border-t border-slate-700 pt-1.5">
                        <p className="text-[9px] text-slate-400 mb-1 font-semibold">Contact information</p>
                        <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                          <div className="min-w-0">
                            <p className="text-slate-500">Email</p>
                            <p className="text-blue-400 break-all">Jane.Doe@microsoft.com</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-500">Chat</p>
                            <p className="text-blue-400 break-all">janedoe@microsoft.com</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Location</p>
                            <p className="text-slate-300">HYD</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-[9px] mt-1.5">
                          <div>
                            <p className="text-slate-500">Company</p>
                            <p className="text-slate-300">MIRPL-HYD</p>
                          </div>
                          <div className="bg-amber-500/20 border border-amber-500/50 rounded px-1 py-0.5">
                            <p className="text-slate-500">Alias</p>
                            <p className="text-amber-300 font-bold">janedoe</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Department</p>
                            <p className="text-slate-300">ENG...</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-900/40 border border-blue-500/30 rounded p-1.5 text-[10px] text-blue-200">
                      <span className="font-semibold">Tip:</span> Email might be <span className="text-blue-300">Jane.Doe@microsoft.com</span> but alias could be <span className="text-amber-300 font-bold">janedoe</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Partner Phone (Optional)</label>
              <input 
                type="tel" 
                placeholder="e.g., 9876543210"
                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-slate-900 bg-white placeholder-slate-400"
                value={partnerPhone || ''}
                onChange={(e) => onPhoneChange?.(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                maxLength={10}
                disabled={status !== 'selected'} 
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Partner T-Shirt Size (Optional)</label>
              <select
                className="w-full mt-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-slate-900 bg-white"
                value={partnerTShirtSize || ''}
                onChange={(e) => onTShirtSizeChange?.(e.target.value)}
                disabled={status !== 'selected'} 
              >
                  <option value="">Select Size</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
              </select>
            </div>
          </div>
        )}

        {status === 'committed' ? (
          <div className="text-sm text-green-700 font-medium flex items-center justify-between">
            <span className="flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</span>
            {canWithdraw && onWithdraw && (
              <button
                onClick={() => onWithdraw(category.id)}
                className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center"
              >
                Withdraw
              </button>
            )}
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
