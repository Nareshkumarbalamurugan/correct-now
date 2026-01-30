import { createRoot } from 'react-dom/client';
import BlogHeader from './BlogHeader';
import './styles.css';

const el = document.getElementById('blog-react-header');
if (el) {
  createRoot(el).render(<BlogHeader />);
}
