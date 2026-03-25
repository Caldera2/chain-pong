'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState, useEffect } from 'react';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiGetSocials, apiUpdateSocials, type SocialLinks } from '@/lib/api';

const TIERS = [
  {
    name: 'Scout',
    requirement: '1 Active Friend',
    perk: '7-Day -1% Fee Discount + "Blue Flame" Ball Trail',
    icon: '🔥',
    color: '#38bdf8',
    friends: 1,
  },
  {
    name: 'Commander',
    requirement: '5 Active Friends',
    perk: '30-Day -2% Fee Discount + "Neon" Ball Trail',
    icon: '⚡',
    color: '#a855f7',
    friends: 5,
  },
  {
    name: 'Arena Legend',
    requirement: '20 Active Friends',
    perk: 'Permanent -3% Fee Discount + "Golden" Table Skin',
    icon: '👑',
    color: '#f5d060',
    friends: 20,
  },
];

const SOCIALS = [
  {
    key: 'xHandle' as const,
    label: 'X (Twitter)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    placeholder: 'username (without @)',
    profileUrl: (handle: string) => `https://x.com/${handle}`,
    color: '#ffffff',
  },
  {
    key: 'farcasterName' as const,
    label: 'Farcaster',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.315 2.1c.791-.39 1.718-.39 2.51 0l8.212 4.075a2.69 2.69 0 0 1 1.505 2.418v6.814a2.69 2.69 0 0 1-1.505 2.418L7.825 21.9c-.791.39-1.718.39-2.51 0L3.103 17.825A2.69 2.69 0 0 1 1.598 15.407V8.593a2.69 2.69 0 0 1 1.505-2.418L5.315 2.1z" />
      </svg>
    ),
    placeholder: 'username',
    profileUrl: (handle: string) => `https://warpcast.com/${handle}`,
    color: '#8B5CF6',
  },
  {
    key: 'telegramUser' as const,
    label: 'Telegram',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    placeholder: 'username (without @)',
    profileUrl: (handle: string) => `https://t.me/${handle}`,
    color: '#26A5E4',
  },
];

export default function Referral() {
  const { setScreen, username } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [socials, setSocials] = useState<SocialLinks>({
    xHandle: null,
    farcasterName: null,
    telegramUser: null,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSocials, setLoadingSocials] = useState(true);

  // Referral stats
  const referralCode = username ? username.toLowerCase().replace(/\s/g, '') : 'player';
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://chain-pong.vercel.app';
  const referralLink = `${siteUrl}?ref=${referralCode}`;
  const activeReferrals = 0;
  const pendingReferrals = 0;
  const feesSaved = 0;
  const currentTierIdx = TIERS.findIndex((t) => activeReferrals < t.friends);
  const nextTier = currentTierIdx === -1 ? null : TIERS[currentTierIdx];
  const progress = nextTier ? (activeReferrals / nextTier.friends) * 100 : 100;

  useEffect(() => {
    apiGetSocials().then((res) => {
      if (res.success && res.data) {
        setSocials(res.data);
      }
      setLoadingSocials(false);
    });
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing = (key: string) => {
    setEditing(key);
    setInputValue((socials as any)[key] || '');
  };

  const saveSocial = async (key: string) => {
    setSaving(true);
    const value = inputValue.trim().replace(/^@/, '') || null;
    const res = await apiUpdateSocials({ [key]: value });
    if (res.success && res.data) {
      setSocials(res.data);
    }
    setSaving(false);
    setEditing(null);
    setInputValue('');
  };

  const unlinkSocial = async (key: string) => {
    setSaving(true);
    const res = await apiUpdateSocials({ [key]: null });
    if (res.success && res.data) {
      setSocials(res.data);
    }
    setSaving(false);
  };

  const openProfile = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-6 sm:mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-gold/10 border border-gold/20">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M16 21V19C16 16.7909 14.2091 15 12 15H5C2.79086 15 1 16.7909 1 19V21" stroke="#f5d060" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8.5" cy="7" r="4" stroke="#f5d060" strokeWidth="1.5"/>
              <path d="M20 8V14M17 11H23" stroke="#f5d060" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Grow the Arena</h1>
          <p className="text-gray-500 text-sm mt-1">Invite friends, reduce your fees, earn rewards</p>
        </motion.div>

        {/* Hero Fee Crusher Card */}
        <motion.div
          className="rounded-2xl p-5 sm:p-6 mb-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(245,208,96,0.06), rgba(16,185,129,0.04))',
            border: '1px solid rgba(245,208,96,0.12)',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl font-black text-gray-600 line-through">5%</div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gold">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="text-3xl font-black text-mint">2%</div>
              <div className="ml-2 flex items-center gap-1 bg-mint/10 border border-mint/20 rounded-full px-2 py-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M8 12L11 15L16 9" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/></svg>
                <span className="text-[10px] text-mint font-bold">VIP</span>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Invite friends to play their first match. Both of you unlock fee discounts and exclusive cosmetics.
            </p>
          </div>
        </motion.div>

        {/* Referral Link */}
        <motion.div
          className="glass-elevated rounded-xl p-4 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Your Referral Link</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2.5 text-sm text-gray-300 font-mono truncate">
              {referralLink}
            </div>
            <button
              onClick={copyLink}
              className={`px-4 py-2.5 rounded-lg font-semibold text-xs transition-all ${
                copied
                  ? 'bg-mint/15 text-mint border border-mint/30'
                  : 'btn-primary'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </motion.div>

        {/* Social Accounts */}
        <motion.div
          className="glass-elevated rounded-2xl p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-bold text-white mb-3">Linked Accounts</h3>
          <div className="space-y-2.5">
            {SOCIALS.map((social) => {
              const value = socials[social.key];
              const isEditing = editing === social.key;
              const isLinked = !!value;

              return (
                <div key={social.key}>
                  <div
                    className="flex items-center gap-3 rounded-xl p-3 transition-all bg-white/[0.03] border border-white/8 hover:border-white/15"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: `${social.color}12`,
                        border: `1px solid ${social.color}25`,
                        color: social.color,
                      }}
                    >
                      {social.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500">{social.label}</div>
                      {isLinked ? (
                        <div className="text-sm text-white font-medium truncate">@{value}</div>
                      ) : (
                        <div className="text-xs text-gray-600">Not linked</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isLinked ? (
                        <>
                          <button
                            onClick={() => openProfile(social.profileUrl(value!))}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-white/[0.05] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white"
                          >
                            View
                          </button>
                          <button
                            onClick={() => unlinkSocial(social.key)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-red-500/10 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300"
                          >
                            Unlink
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(social.key)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all btn-primary"
                        >
                          Link
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div
                        className="mt-1.5 flex items-center gap-2 px-1"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <input
                          type="text"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          placeholder={social.placeholder}
                          autoFocus
                          className="flex-1 bg-white/[0.03] border border-white/10 focus:border-white/25 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSocial(social.key);
                            if (e.key === 'Escape') { setEditing(null); setInputValue(''); }
                          }}
                        />
                        <button
                          onClick={() => saveSocial(social.key)}
                          disabled={saving || !inputValue.trim()}
                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-mint/15 text-mint border border-mint/30 hover:bg-mint/25 transition-all disabled:opacity-40"
                        >
                          {saving ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditing(null); setInputValue(''); }}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
          {loadingSocials && (
            <div className="text-center text-xs text-gray-600 mt-3">Loading...</div>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="glass-elevated rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-white">{activeReferrals}</div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Active</div>
          </div>
          <div className="glass-elevated rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-white">{pendingReferrals}</div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Pending</div>
          </div>
          <div className="glass-elevated rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-gold">{feesSaved.toFixed(3)}</div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{TOKEN_SYMBOL} Saved</div>
          </div>
        </motion.div>

        {/* Tier Progress */}
        <motion.div
          className="glass-elevated rounded-2xl p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">Referral Tiers</h3>
            {nextTier && (
              <span className="text-[10px] text-gray-500">
                {activeReferrals}/{nextTier.friends} to <span style={{ color: nextTier.color }}>{nextTier.name}</span>
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-white/5 rounded-full mb-5 overflow-hidden">
            <motion.div
              className="h-full rounded-full progress-shimmer"
              style={{ background: nextTier?.color || '#f5d060' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </div>

          {/* Tier cards */}
          <div className="space-y-2.5">
            {TIERS.map((tier, i) => {
              const isUnlocked = activeReferrals >= tier.friends;
              const isCurrent = i === Math.max(0, currentTierIdx - 1) && currentTierIdx > 0;
              return (
                <div
                  key={tier.name}
                  className={`rounded-xl p-3.5 flex items-start gap-3 transition-all ${
                    isUnlocked
                      ? 'bg-white/[0.04] border border-white/10'
                      : 'bg-white/[0.015] border border-white/5 opacity-60'
                  }`}
                  style={isCurrent ? { borderColor: `${tier.color}30` } : undefined}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg"
                    style={{
                      background: `${tier.color}12`,
                      border: `1px solid ${tier.color}25`,
                    }}
                  >
                    {tier.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: tier.color }}>{tier.name}</span>
                      {isUnlocked && (
                        <span className="text-[9px] bg-mint/10 text-mint px-1.5 py-0.5 rounded font-bold">UNLOCKED</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{tier.requirement}</div>
                    <div className="text-[10px] text-gray-600 mt-1">{tier.perk}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Anti-sybil note */}
        <motion.div
          className="text-center text-[10px] text-gray-600 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="inline mr-1 -mt-0.5">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Referrals are validated after the invited player completes their first 0.01 {TOKEN_SYMBOL} PvP match
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="text-gray-600 hover:text-white transition-colors mx-auto block text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
