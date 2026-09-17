import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getRoleHomeRoute } from '../auth/roleRoutes';

export default function NotFoundPage() {
  const { isAuthenticated, user } = useAuth();
  const destination = isAuthenticated ? getRoleHomeRoute(user.role) : '/login';

  return (
    <main className="full-page-message">
      <section className="message-card">
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link className="button button-primary" to={destination}>
          {isAuthenticated ? 'Go to my home page' : 'Go to sign in'}
        </Link>
      </section>
    </main>
  );
}
