export type BlogPostMeta = {
  slug: string;
  title: string;
  date?: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
};

export type BlogPost = {
  meta: BlogPostMeta;
  content: string;
};

type RawModuleMap = Record<string, string>;

const parseFrontmatter = (raw: string): { meta: Record<string, string>; body: string } => {
  const text = String(raw ?? "");
  if (!text.startsWith("---")) {
    return { meta: {}, body: text };
  }

  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: text };
  }

  const fmBlock = text.slice(3, end).trim();
  const body = text.slice(end + "\n---".length).replace(/^\s*\n/, "");

  const meta: Record<string, string> = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    meta[key] = value;
  }

  return { meta, body };
};

const fileToSlug = (filePath: string) => {
  const file = filePath.split("/").pop() || "";
  return file.replace(/\.md$/i, "");
};

const loadRawPosts = (): Array<{ path: string; raw: string }> => {
  // Vite: import markdown as raw strings
  const modules = import.meta.glob("../content/blog/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as RawModuleMap;

  return Object.entries(modules).map(([path, raw]) => ({ path, raw }));
};

export const getAllBlogPosts = (): BlogPostMeta[] => {
  const posts: BlogPostMeta[] = [];

  for (const { path, raw } of loadRawPosts()) {
    const slug = fileToSlug(path);
    const { meta } = parseFrontmatter(raw);

    const title = meta.title || slug;
    const date = meta.date;
    const excerpt = meta.excerpt;
    const author = meta.author;
    const tags = meta.tags
      ? meta.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    posts.push({ slug, title, date, excerpt, author, tags });
  }

  // Newest first (string date works for YYYY-MM-DD)
  posts.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return posts;
};

export const getBlogPostBySlug = (slug: string): BlogPost | null => {
  const items = loadRawPosts();
  for (const { path, raw } of items) {
    if (fileToSlug(path) !== slug) continue;
    const { meta, body } = parseFrontmatter(raw);

    const title = meta.title || slug;
    const date = meta.date;
    const excerpt = meta.excerpt;
    const author = meta.author;
    const tags = meta.tags
      ? meta.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    return {
      meta: { slug, title, date, excerpt, author, tags },
      content: body,
    };
  }

  return null;
};
