import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";
import { getAllBlogPosts } from "@/lib/blog";

const Blog = () => {
  const posts = getAllBlogPosts();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-background to-accent/5 py-10 md:py-14">
          <div className="container max-w-6xl">
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
          <div className="container max-w-6xl">
            <div className="grid gap-4">
              {posts.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-muted-foreground">
                  No posts yet.
                </div>
              ) : (
                posts.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/blog/${p.slug}`}
                    className="rounded-xl border border-border p-5 bg-background hover:bg-accent/10 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">{p.title}</h2>
                        {p.excerpt ? (
                          <p className="mt-1 text-sm text-muted-foreground">{p.excerpt}</p>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {p.date || ""}
                      </div>
                    </div>
                  </Link>
                ))
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
