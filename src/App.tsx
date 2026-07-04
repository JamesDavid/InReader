import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import FeedList from './components/FeedList';
import SearchResults from './components/SearchResults';
import ChatsView from './components/ChatsView';
import { seedDefaultFeedsIfNeeded } from './services/defaultFeeds';

function App() {
  useEffect(() => {
    // Seed starter feeds on a brand-new install (runs at most once per browser).
    seedDefaultFeedsIfNeeded();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<FeedList />} />
          <Route path="feed/:feedId" element={<FeedList />} />
          <Route path="folder/:folderId" element={<FeedList />} />
          <Route path="starred" element={<FeedList />} />
          <Route path="listened" element={<FeedList />} />
          <Route path="recommended" element={<FeedList />} />
          <Route path="chats" element={<ChatsView />} />
          <Route path="search/:query" element={<SearchResults />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
