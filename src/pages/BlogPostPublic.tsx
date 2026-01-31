import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DOMPurify from "dompurify";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fetchBlogPostById, fetchBlogPostBySlug, type FirestoreBlogPost } from "@/lib/blogFirestore";
import { getFirebaseDb } from "@/lib/firebase";
import { doc, increment, updateDoc } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addBlogComment, fetchBlogComments, type FirestoreBlogComment } from "@/lib/blogComments";
import { toast } from "sonner";

const BlogPostPublic = () => {
  const { slug } = useParams();
  const [post, setPost] = useState<FirestoreBlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  const [comments, setComments] = useState<FirestoreBlogComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentName, setCommentName] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!slug) {
        setLoading(false);
        return;
      }

      try {
        // Prefer slug lookup for SEO URLs. Fall back to ID if user pasted an old id.
        const data = (await fetchBlogPostBySlug(slug)) || (await fetchBlogPostById(slug));
        if (!cancelled) setPost(data);
      } catch {
        if (!cancelled) setPost(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!post?.id) {
        setCommentsLoading(false);
        return;
      }

      try {
        const data = await fetchBlogComments(post.id, 200);
        if (!cancelled) setComments(data);
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setCommentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [post?.id]);

  useEffect(() => {
    if (!post?.id) return;

    // Count a view at most once per browser per 12h.
    const key = `correctnow:blog:viewed:${post.id}`;
    const now = Date.now();
    const last = Number(localStorage.getItem(key) || 0);
    if (Number.isFinite(last) && now - last < 12 * 60 * 60 * 1000) return;
    localStorage.setItem(key, String(now));

    const db = getFirebaseDb();
    if (!db) return;
    updateDoc(doc(db, "blogs", post.id), { views: increment(1) }).catch(() => {
      // ignore view update failures
    });
  }, [post?.id]);

  useEffect(() => {
    if (!post?.title) return;
    document.title = `${post.title} | CorrectNow Blog`;
  }, [post?.title]);

  const safeHtml = useMemo(() => {
    const html = post?.contentHtml || "";
    if (!html) return "";
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }, [post?.contentHtml]);

  const viewsLabel = useMemo(() => {
    const views = post?.views ?? 0;
    return `${views.toLocaleString()} views`;
  }, [post?.views]);

  const formatDateTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const handleSubmitComment = async () => {
    if (!post?.id) return;
    const message = commentMessage.trim();
    if (!message) {
      toast.error("Please enter a comment");
      return;
    }
    setCommentPosting(true);
    try {
      await addBlogComment(post.id, { name: commentName, message });
      setCommentMessage("");
      const data = await fetchBlogComments(post.id, 200);
      setComments(data);
      toast.success("Comment posted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setCommentPosting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-background to-accent/5 py-10 md:py-14">
          <div className="container max-w-5xl">
            <div className="flex flex-col gap-3">
              <Link to="/blog" className="text-sm text-muted-foreground hover:underline">
                ← Back to Blog
              </Link>

              {loading ? (
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Loading...
                </h1>
              ) : !post ? (
                <>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    Post not found
                  </h1>
                  <p className="text-muted-foreground">The post may have been removed.</p>
                </>
              ) : (
                <>
                  <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
                    {post.title}
                  </h1>
                  <div className="text-sm text-muted-foreground">
                    {post.publishedAt ? <span>{formatDateTime(post.publishedAt)}</span> : null}
                    <span>{post.publishedAt ? " · " : ""}{viewsLabel}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {post && !loading ? (
          <section className="py-10">
            <div className="container max-w-5xl">
              {post.coverImageUrl ? (
                <div className="mb-6 overflow-hidden rounded-xl border border-border bg-muted/10">
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </div>
              ) : null}

              <article
                className="prose prose-neutral dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />

              <div className="mt-10 border-t border-border pt-8">
                <h2 className="text-xl font-semibold text-foreground">Comments</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Comments are visible to everyone.
                </p>

                <div className="mt-4 grid gap-3 rounded-xl border border-border p-4 bg-background">
                  <Input
                    value={commentName}
                    onChange={(e) => setCommentName(e.target.value)}
                    placeholder="Your name (optional)"
                    maxLength={60}
                  />
                  <Textarea
                    value={commentMessage}
                    onChange={(e) => setCommentMessage(e.target.value)}
                    placeholder="Write a comment..."
                    rows={4}
                    maxLength={2000}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleSubmitComment} disabled={commentPosting}>
                      {commentPosting ? "Posting..." : "Post Comment"}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  {commentsLoading ? (
                    <div className="text-sm text-muted-foreground">Loading comments...</div>
                  ) : comments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No comments yet.</div>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="rounded-xl border border-border p-4 bg-background">
                        <div className="flex items-center justify-between gap-4">
                          <div className="font-medium text-foreground">{c.name || "Anonymous"}</div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(c.createdAtIso)}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">{c.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
};

export default BlogPostPublic;
