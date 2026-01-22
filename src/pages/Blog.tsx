import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type BlogPost = {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  publishedAt?: string;
  createdAt?: string;
};

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const loadPosts = async () => {
      const db = getFirebaseDb();
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        const blogQuery = query(
          collection(db, "blogs"),
          orderBy("publishedAt", "desc")
        );
        const snap = await getDocs(blogQuery);
        const list: BlogPost[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          return {
            id: docSnap.id,
            title: data?.title || "",
            content: data?.content || "",
            imageUrl: data?.imageUrl || "",
            publishedAt: data?.publishedAt,
            createdAt: data?.createdAt,
          };
        });
        setPosts(list);
      } finally {
        setLoading(false);
      }
    };

    loadPosts();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {!expandedId && (
          <section className="border-b border-border bg-gradient-to-b from-background to-accent/5 py-16 md:py-24">
            <div className="container max-w-4xl">
              <div className="flex flex-col items-center text-center gap-4">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
                  Blog
                </h1>
                <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
                  Updates, writing tips, and product news from CorrectNow
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="py-16 md:py-20">
          <div className="container max-w-6xl">
            {expandedId && (
              <div className="mb-6">
                <Button variant="outline" onClick={() => setExpandedId(null)}>
                  ← Go Back
                </Button>
              </div>
            )}
            {loading ? (
              <p className="text-center text-muted-foreground">Loading posts...</p>
            ) : posts.length ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => {
                  const isExpanded = expandedId === post.id;
                  return (
                    <Card
                      key={post.id}
                      className={`group overflow-hidden border-border transition-all ${
                        isExpanded ? "lg:col-span-3" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : post.id)
                        }
                        className="w-full text-left"
                      >
                        {post.imageUrl && (
                          <div
                            className={`w-full bg-muted ${
                              isExpanded ? "h-72 md:h-96" : "h-56"
                            }`}
                          >
                            <img
                              src={post.imageUrl}
                              alt={post.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <CardContent className="p-6 space-y-3">
                          <div className="flex flex-col gap-2">
                            <h2 className="text-xl md:text-2xl font-semibold text-foreground">
                              {post.title}
                            </h2>
                            <span className="text-sm text-muted-foreground">
                              {post.publishedAt
                                ? new Date(post.publishedAt).toLocaleString()
                                : post.createdAt
                                ? new Date(post.createdAt).toLocaleString()
                                : ""}
                            </span>
                          </div>
                          {isExpanded && (
                            <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                              {post.content}
                            </p>
                          )}
                        </CardContent>
                      </button>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">No blog posts yet.</p>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
