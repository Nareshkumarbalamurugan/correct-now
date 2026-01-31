import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getAllBlogPosts } from "@/lib/blog";
import { fetchBlogPosts, type FirestoreBlogPost } from "@/lib/blogFirestore";

const Blog = () => {
  const markdownPosts = useMemo(() => getAllBlogPosts(), []);
  const [posts, setPosts] = useState<FirestoreBlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchBlogPosts(50);
        if (!cancelled) setPosts(data);
      } catch {
        // ignore (falls back to markdown posts)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-background to-accent/5 py-10 md:py-14">
          <div className="container max-w-7xl">
            <div className="flex flex-col items-center text-center gap-3">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Blog
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-2xl">
                Updates, writing tips, and product news from CorrectNow
              </p>
            </div>
          </div>
        </section>

        <section className="py-6 md:py-8">
          <div className="container max-w-7xl">
            <div className="grid gap-6">
              {loading ? (
                <div className="rounded-xl border border-border p-6 text-muted-foreground">
                  Loading posts...
                </div>
              ) : posts.length === 0 && markdownPosts.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-muted-foreground">
                  No posts yet.
                </div>
              ) : (
                <>
                  {posts.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {posts.map((p) => (
                        <Link
                          key={p.id}
                          to={`/blog/${p.slug || p.id}`}
                          className="group rounded-xl border border-border bg-background hover:bg-accent/10 transition overflow-hidden"
                        >
                          <div className="w-full aspect-[3/4] bg-muted/20 overflow-hidden flex items-center justify-center">
                            {p.coverImageUrl ? (
                              <img
                                src={p.coverImageUrl}
                                alt={p.title}
                                className="h-full w-full object-contain bg-muted/10"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10">
                                <div className="text-xs text-muted-foreground">No image</div>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h2 className="text-base font-semibold text-foreground line-clamp-2">
                              {p.title}
                            </h2>
                            {p.contentText ? (
                              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                {p.contentText}
                              </p>
                            ) : null}
                            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{formatDate(p.publishedAt)}</span>
                              <span>{(p.views ?? 0).toLocaleString()} views</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {markdownPosts.length ? (
                    <div className="pt-6">
                      <div className="text-sm font-medium text-muted-foreground mb-2">
                        Developer posts
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {markdownPosts.map((p) => (
                          <Link
                            key={p.slug}
                            to={`/blog-md/${p.slug}`}
                            className="rounded-xl border border-border p-5 bg-background hover:bg-accent/10 transition"
                          >
                            <h2 className="text-base font-semibold text-foreground line-clamp-2">
                              {p.title}
                            </h2>
                            {p.excerpt ? (
                              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{p.excerpt}</p>
                            ) : null}
                            <div className="mt-3 text-xs text-muted-foreground">
                              {p.date || ""}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
