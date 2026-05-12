import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <div className="text-6xl font-bold text-primary-700">404</div>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-500">The page or parcel you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-primary-700 hover:bg-primary-800 text-white px-5 py-2 font-medium"
      >
        Back to home
      </Link>
    </div>
  );
}
