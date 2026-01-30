# CorrectNow WordPress Blog Header

Standalone React header for WordPress blog integration.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Development (Test Locally)
```bash
npm run dev
```
Open http://localhost:5173 to preview

### 3. Build for WordPress
```bash
npm run build
```

This creates:
```
build/
  assets/
    index.js     ← Upload this to WordPress
    index.css    ← Upload this to WordPress
```

## WordPress Integration Steps

### Step 1: Upload Build Files
Upload to WordPress at:
```
wp-content/themes/astra-child/react/build/assets/
  ├── index.js
  └── index.css
```

### Step 2: Verify functions.php
Ensure `astra-child/functions.php` has:
```php
<?php
add_theme_support('post-thumbnails');

function load_blog_react_header() {
  if ( is_home() || is_single() ) {
    wp_enqueue_script(
      'blog-react',
      get_stylesheet_directory_uri() . '/react/build/assets/index.js',
      [],
      null,
      true
    );
    
    wp_enqueue_style(
      'blog-react-css',
      get_stylesheet_directory_uri() . '/react/build/assets/index.css'
    );
  }
}
add_action('wp_enqueue_scripts', 'load_blog_react_header');
```

### Step 3: Hide Astra Header
Add to WordPress Customizer → Additional CSS:
```css
.blog header.site-header,
.blog footer.site-footer,
.single-post header.site-header,
.single-post footer.site-footer {
  display: none !important;
}
```

### Step 4: Verify home.php
Ensure `astra-child/home.php` has:
```php
<?php get_header(); ?>
<div id="blog-react-header"></div>
<!-- rest of blog content -->
<?php get_footer(); ?>
```

## Customization

Edit `src/BlogHeader.jsx` to modify:
- Logo
- Navigation links
- CTA buttons
- Colors (in `src/styles.css`)

After changes, run `npm run build` again.
