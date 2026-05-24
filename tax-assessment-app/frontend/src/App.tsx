import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import ParcelDetailPage from './pages/ParcelDetailPage';
import InsightsPage from './pages/InsightsPage';
import DashboardPage from './pages/DashboardPage';
import AgentPage from './pages/AgentPage';
import AboutAgentPage from './pages/AboutAgentPage';
import AskPage from './pages/AskPage';
import PipelinePage from './pages/PipelinePage';
import MapPage from './pages/MapPage';
import WatchlistPage from './pages/WatchlistPage';
import AboutPage from './pages/AboutPage';
import ArchitecturePage from './pages/ArchitecturePage';
import NotFoundPage from './pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/parcels/:parcelId" element={<ParcelDetailPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            {/* Backward-compat: keep /analytics resolving */}
            <Route path="/analytics" element={<DashboardPage />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/about-agent" element={<AboutAgentPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/architecture" element={<ArchitecturePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
