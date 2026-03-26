'use client';

import { useGameStore } from '@/lib/store';
import { useState, useEffect } from 'react';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiGetSocials, apiUpdateSocials, type SocialLinks } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Copy, Check, Users, TrendingDown, Flame, Zap, Crown,
  ExternalLink, Link2, Unlink, Info, Loader2
} from 'lucide-react';

const TIERS = [
  { name: 'Scout', requirement: '1 Active Friend', perk: '7-Day -1% Fee Discount + "Blue Flame" Ball Trail', Icon: Flame, color: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/20', friends: 1 },
  { name: 'Commander', requirement: '5 Active Friends', perk: '30-Day -2% Fee Discount + "Neon" Ball Trail', Icon: Zap, color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20', friends: 5 },
  { name: 'Arena Legend', requirement: '20 Active Friends', perk: 'Permanent -3% Fee Discount + "Golden" Table Skin', Icon: Crown, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', friends: 20 },
];

const SOCIALS = [
  { key: 'xHandle' as const, label: 'X (Twitter)', placeholder: 'username (without @)', profileUrl: (h: string) => `https://x.com/${h}` },
  { key: 'farcasterName' as const, label: 'Farcaster', placeholder: 'username', profileUrl: (h: string) => `https://warpcast.com/${h}` },
  { key: 'telegramUser' as const, label: 'Telegram', placeholder: 'username (without @)', profileUrl: (h: string) => `https://t.me/${h}` },
];

export default function Referral() {
  const { setScreen, username } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [socials, setSocials] = useState<SocialLinks>({ xHandle: null, farcasterName: null, telegramUser: null });
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSocials, setLoadingSocials] = useState(true);

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
      if (res.success && res.data) setSocials(res.data);
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
    if (res.success && res.data) setSocials(res.data);
    setSaving(false);
    setEditing(null);
    setInputValue('');
  };

  const unlinkSocial = async (key: string) => {
    setSaving(true);
    const res = await apiUpdateSocials({ [key]: null });
    if (res.success && res.data) setSocials(res.data);
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('lobby')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Grow the Arena</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Invite friends, reduce your fees, earn rewards</p>
        </div>

        {/* Fee Crusher */}
        <Card className="border-primary/10 bg-primary/[0.02]">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-black text-muted-foreground line-through">5%</span>
              <TrendingDown className="w-5 h-5 text-primary" />
              <span className="text-2xl font-black text-emerald-400">2%</span>
              <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 ml-1">VIP</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Invite friends to play their first match. Both of you unlock fee discounts and exclusive cosmetics.
            </p>
          </CardContent>
        </Card>

        {/* Referral Link */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mb-2">Your Referral Link</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-mono text-muted-foreground truncate">
                {referralLink}
              </div>
              <Button
                size="sm"
                variant={copied ? 'outline' : 'default'}
                onClick={copyLink}
                className={copied ? 'border-emerald-500/30 text-emerald-400' : ''}
              >
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Social Accounts */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3">Linked Accounts</h3>
            <div className="space-y-2.5">
              {SOCIALS.map((social) => {
                const value = socials[social.key];
                const isEditing = editing === social.key;
                const isLinked = !!value;

                return (
                  <div key={social.key}>
                    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Link2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">{social.label}</p>
                        {isLinked ? (
                          <p className="text-sm font-medium truncate">@{value}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/60">Not linked</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isLinked ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => window.open(social.profileUrl(value!), '_blank', 'noopener,noreferrer')}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px] text-destructive hover:text-destructive"
                              onClick={() => unlinkSocial(social.key)}
                              disabled={saving}
                            >
                              <Unlink className="w-3 h-3" />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" className="h-7 px-3 text-[10px]" onClick={() => startEditing(social.key)}>
                            Link
                          </Button>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-1.5 flex items-center gap-2 px-1">
                        <Input
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          placeholder={social.placeholder}
                          autoFocus
                          className="text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSocial(social.key);
                            if (e.key === 'Escape') { setEditing(null); setInputValue(''); }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => saveSocial(social.key)}
                          disabled={saving || !inputValue.trim()}
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditing(null); setInputValue(''); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {loadingSocials && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-3">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold font-heading">{activeReferrals}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold font-heading">{pendingReferrals}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold font-heading text-primary">{feesSaved.toFixed(3)}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{TOKEN_SYMBOL} Saved</p>
            </CardContent>
          </Card>
        </div>

        {/* Tier Progress */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Referral Tiers</h3>
              {nextTier && (
                <span className="text-[10px] text-muted-foreground">
                  {activeReferrals}/{nextTier.friends} to <span className={nextTier.color}>{nextTier.name}</span>
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-muted rounded-full mb-5 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>

            {/* Tier cards */}
            <div className="space-y-2.5">
              {TIERS.map((tier) => {
                const isUnlocked = activeReferrals >= tier.friends;
                return (
                  <div
                    key={tier.name}
                    className={`rounded-lg p-3.5 flex items-start gap-3 border ${
                      isUnlocked ? 'border-border bg-muted/30' : 'border-border/50 opacity-60'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg ${tier.bg} ${tier.border} border flex items-center justify-center shrink-0`}>
                      <tier.Icon className={`w-4 h-4 ${tier.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${tier.color}`}>{tier.name}</span>
                        {isUnlocked && (
                          <Badge variant="outline" className="text-[8px] border-emerald-500/30 text-emerald-400">UNLOCKED</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{tier.requirement}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{tier.perk}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Anti-sybil note */}
        <p className="text-center text-[10px] text-muted-foreground/60 flex items-center justify-center gap-1">
          <Info className="w-3 h-3" />
          Referrals are validated after the invited player completes their first 0.01 {TOKEN_SYMBOL} PvP match
        </p>
      </div>
    </div>
  );
}
