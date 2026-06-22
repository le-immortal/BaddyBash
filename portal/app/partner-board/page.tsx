'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import clsx from 'clsx';
import { Loader2, Mail, MessageCircle, Plus, Trash2, UserRound, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import ErrorScreen from '../components/ErrorScreen';
import type { Category, PartnerPostStatus, SkillLevel } from '../lib/models';

type PartnerCategory = Extract<Category, 'MD' | 'WD' | 'XD'>;
type CategoryFilter = 'All' | PartnerCategory;

interface PartnerPost {
  id: string;
  displayName: string;
  avatar?: string;
  alias: string;
  category: PartnerCategory;
  skillLevel: SkillLevel;
  status: PartnerPostStatus;
  createdAt: string;
  isOwner: boolean;
}

interface PartnerPostsResponse {
  seasonId: string;
  posts: PartnerPost[];
}

const categories: PartnerCategory[] = ['MD', 'WD', 'XD'];
const skillLevels: SkillLevel[] = ['beginner', 'intermediate', 'advanced'];
const fetchTimeoutMs = 8000;

function PartnerBoardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Navbar />
      {children}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

function formatSkillLevel(level: SkillLevel) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function relativePostedTime(value: string) {
  const posted = new Date(value).getTime();
  if (Number.isNaN(posted)) return 'Recently posted';

  const diffMs = Date.now() - posted;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function categoryBadgeClass(category: PartnerCategory) {
  switch (category) {
    case 'MD':
      return 'bg-blue-500/15 text-blue-200 border-blue-400/30';
    case 'WD':
      return 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30';
    case 'XD':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readApiError(res: Response) {
  try {
    const body = await res.json() as { error?: string; message?: string };
    return body.error || body.message || `Request failed with status ${res.status}`;
  } catch {
    return `Request failed with status ${res.status}`;
  }
}

function PartnerPostCard({
  post,
  busy,
  onMarkFound,
  onDelete,
}: {
  post: PartnerPost;
  busy: boolean;
  onMarkFound: (post: PartnerPost) => void;
  onDelete: (post: PartnerPost) => void;
}) {
  const isClosed = post.status === 'closed';

  return (
    <article
      className={clsx(
        'border rounded-xl p-4 shadow-sm transition-all bg-slate-900/80 border-slate-700',
        post.isOwner && 'ring-2 ring-blue-500/70 border-blue-400/60',
        isClosed && 'opacity-70 bg-slate-900/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-white shrink-0 bg-cover bg-center"
          style={post.avatar ? { backgroundImage: `url(${post.avatar})` } : undefined}
          aria-label={`${post.displayName} avatar`}
        >
          {!post.avatar && getInitials(post.displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-lg text-white truncate">{post.displayName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border', categoryBadgeClass(post.category))}>
                  {post.category}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                  {formatSkillLevel(post.skillLevel)}
                </span>
                {isClosed && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                    Partner found
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-300 shrink-0 pt-1">
              <span className={clsx('h-2.5 w-2.5 rounded-full', isClosed ? 'bg-emerald-400' : 'bg-blue-400')} />
              <span>{isClosed ? 'Partner found' : 'Open'}</span>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-sm text-slate-300 bg-slate-950/40 rounded-lg border border-slate-800 p-3">
            <MessageCircle className="w-4 h-4 mt-0.5 text-blue-300 shrink-0" />
            <p className="break-words">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teams alias</span>
              <span className="ml-2 font-semibold text-blue-200">@{post.alias}</span>
            </p>
          </div>

          {post.isOwner ? (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
              {isClosed ? (
                <span className="text-xs font-medium text-emerald-300">This post is marked as found.</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onMarkFound(post)}
                  disabled={busy}
                  className="text-xs font-semibold text-blue-300 hover:text-blue-200 disabled:opacity-50"
                >
                  Mark as found
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(post)}
                disabled={busy}
                aria-label={`Delete ${post.category} partner post`}
                className="p-2 rounded-lg text-red-300 hover:text-red-200 hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 border-t border-slate-800 pt-3">
              <Mail className="w-3.5 h-3.5" />
              <span>Posted {relativePostedTime(post.createdAt)}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function CreatePostModal({
  submitting,
  error,
  unavailableCategories,
  initialCategory,
  onClose,
  onSubmit,
}: {
  submitting: boolean;
  error: string | null;
  unavailableCategories: ReadonlySet<PartnerCategory>;
  initialCategory: PartnerCategory | null;
  onClose: () => void;
  onSubmit: (payload: { category: PartnerCategory; skillLevel: SkillLevel }) => void;
}) {
  const [category, setCategory] = useState<PartnerCategory>(initialCategory ?? 'MD');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const allCategoriesUnavailable = unavailableCategories.size === categories.length;
  const selectedCategoryUnavailable = unavailableCategories.has(category);
  const firstFocusableCategory = initialCategory ?? categories[0];
  const postDisabled = submitting || allCategoriesUnavailable || selectedCategoryUnavailable;

  useEffect(() => {
    const focusTimer = window.setTimeout(() => firstButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitting, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-partner-post-title"
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="create-partner-post-title" className="text-xl font-bold text-white">Post that I&apos;m looking</h2>
            <p className="mt-1 text-sm text-slate-400">Choose your doubles category and skill level.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close create partner post modal"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="space-y-5 px-5 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (postDisabled) return;
            onSubmit({ category, skillLevel });
          }}
        >
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Category</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => {
                const alreadyPosted = unavailableCategories.has(item);

                return (
                  <button
                    key={item}
                    ref={item === firstFocusableCategory ? firstButtonRef : undefined}
                    type="button"
                    aria-pressed={category === item}
                    disabled={alreadyPosted || submitting}
                    onClick={() => setCategory(item)}
                    className={clsx(
                      'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                      alreadyPosted && 'cursor-not-allowed opacity-45',
                      !alreadyPosted && category === item && 'border-blue-500 bg-blue-600 text-white',
                      !alreadyPosted && category !== item && 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500',
                      alreadyPosted && 'border-slate-700 bg-slate-800 text-slate-500'
                    )}
                  >
                    <span>{item}</span>
                    {alreadyPosted && <span className="ml-1 text-[10px] font-medium">(already posted)</span>}
                  </button>
                );
              })}
            </div>
            {allCategoriesUnavailable && (
              <p className="mt-2 text-sm text-amber-200">You already have open posts in every category.</p>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Skill level</legend>
            <div className="flex flex-wrap gap-2">
              {skillLevels.map(item => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={skillLevel === item}
                  onClick={() => setSkillLevel(item)}
                  className={clsx(
                    'px-4 py-2 rounded-full text-sm font-semibold border transition-colors',
                    skillLevel === item ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {formatSkillLevel(item)}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={postDisabled}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Post
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PartnerBoardPage() {
  const { status: sessionStatus } = useSession();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [showMine, setShowMine] = useState(false);
  const [posts, setPosts] = useState<PartnerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionPostId, setActionPostId] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    if (sessionStatus !== 'authenticated') return;

    setLoading(true);
    setPageError(null);

    try {
      const buildUrl = (status: PartnerPostStatus) => `/api/partner-posts?status=${status}`;
      const statuses: PartnerPostStatus[] = showMine ? ['open', 'closed'] : ['open'];
      const responses = await Promise.all(statuses.map(status => fetchWithTimeout(buildUrl(status))));

      const failed = responses.find(res => !res.ok);
      if (failed) {
        throw new Error(await readApiError(failed));
      }

      const data = await Promise.all(responses.map(res => res.json() as Promise<PartnerPostsResponse>));
      const nextPosts = data.flatMap(item => item.posts);
      setPosts(showMine ? nextPosts.filter(post => post.isOwner) : nextPosts.filter(post => post.status === 'open'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setPageError('Loading partner posts timed out. Please try again.');
      } else {
        setPageError(error instanceof Error ? error.message : 'Failed to load partner posts.');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionStatus, showMine]);

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchPosts();
    } else if (sessionStatus === 'unauthenticated') {
      setLoading(false);
    }
  }, [sessionStatus, fetchPosts]);

  const visiblePosts = useMemo(() => {
    const filtered = selectedCategory === 'All' ? posts : posts.filter(post => post.category === selectedCategory);
    return [...filtered].sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, selectedCategory]);

  const ownerOpenCategories = useMemo(() => {
    return new Set<PartnerCategory>(
      posts
        .filter(post => post.isOwner && post.status === 'open')
        .map(post => post.category)
    );
  }, [posts]);

  const firstAvailableCategory = useMemo(() => {
    return categories.find(category => !ownerOpenCategories.has(category)) ?? null;
  }, [ownerOpenCategories]);

  const handleCreatePost = async (payload: { category: PartnerCategory; skillLevel: SkillLevel }) => {
    setModalError(null);

    setSubmitting(true);
    try {
      const res = await fetchWithTimeout('/api/partner-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await readApiError(res);
        if (res.status === 409) {
          setModalError(message);
          return;
        }

        throw new Error(message);
      }

      setModalOpen(false);
      await fetchPosts();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to save your partner post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkFound = async (post: PartnerPost) => {
    setActionPostId(post.id);
    setPageError(null);
    try {
      const res = await fetchWithTimeout(`/api/partner-posts/${encodeURIComponent(post.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      await fetchPosts();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to update partner post.');
    } finally {
      setActionPostId(null);
    }
  };

  const handleDelete = async (post: PartnerPost) => {
    setActionPostId(post.id);
    setPageError(null);
    try {
      const res = await fetchWithTimeout(`/api/partner-posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      await fetchPosts();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to delete partner post.');
    } finally {
      setActionPostId(null);
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <PartnerBoardShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </PartnerBoardShell>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <PartnerBoardShell>
        <ErrorScreen bare title="Sign in required" message="Please sign in to browse and post on the partner board." />
      </PartnerBoardShell>
    );
  }

  return (
    <PartnerBoardShell>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-300">Partner Board</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">Find a doubles partner</h1>
            <p className="mt-3 max-w-2xl text-slate-300">Browse players looking for MD, WD, or XD partners and post your own search.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500"
          >
            <Plus className="w-4 h-4" />
            Post that I&apos;m looking
          </button>
        </div>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="Filter partner posts by category">
              {(['All', ...categories] as CategoryFilter[]).map(item => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selectedCategory === item}
                  onClick={() => setSelectedCategory(item)}
                  className={clsx(
                    'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                    selectedCategory === item ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={showMine}
              onClick={() => setShowMine(value => !value)}
              className={clsx(
                'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                showMine ? 'border-blue-400 bg-blue-500/20 text-blue-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
              )}
            >
              My Posts
            </button>
          </div>
        </section>

        {pageError && !loading && posts.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-24 text-slate-300">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading partner posts…</span>
          </div>
        ) : pageError && posts.length === 0 ? (
          <ErrorScreen bare title="Could not load partner posts" message={pageError} />
        ) : visiblePosts.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-20 text-center shadow-sm">
            <UserRound className="mx-auto mb-4 h-12 w-12 text-slate-500" />
            <h2 className="text-2xl font-bold text-white">No one&apos;s looking yet — be the first to post.</h2>
            <p className="mt-2 text-sm text-slate-400">Create a quick partner post for MD, WD, or XD.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePosts.map(post => (
              <PartnerPostCard
                key={post.id}
                post={post}
                busy={actionPostId === post.id}
                onMarkFound={handleMarkFound}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {modalOpen && (
        <CreatePostModal
          submitting={submitting}
          error={modalError}
          unavailableCategories={ownerOpenCategories}
          initialCategory={firstAvailableCategory}
          onClose={() => {
            if (!submitting) setModalOpen(false);
          }}
          onSubmit={handleCreatePost}
        />
      )}
    </PartnerBoardShell>
  );
}
